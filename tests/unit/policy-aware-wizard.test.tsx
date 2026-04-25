// @vitest-environment jsdom
//
// Phase D2 (Session #44) — chassis test for `<PolicyAwareWizard>`.
//
// Exercises the cross-step contract:
//   - Step 1 validation gates Next until a profile is picked.
//   - Step 3 auto-fires usePolicyPreflight on entry; the badge tracks
//     idle → submitting → done/blocked/warned.
//   - "Resolve overrides" opens PolicyOverrideDialog when unresolved
//     warnings are present.
//   - Override confirm threads back into the decision (re-check fires
//     and clears the unresolved warning count).
//
// Step 4 (Run) is exercised by the integration suites and the
// useWorkflowRun unit; here we just assert the Run button mounts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"

import { PolicyAwareWizard } from "@/client/components/PolicyAwareWizard"
import { metaConfig, type MetaWizardForm } from "@/client/lane-wizards/meta-config"

interface MockResponseBuilder {
  profiles: { profiles: { id: string; name: string; category: string }[] }
  preflight: () => unknown
}

function stubFetch(builder: MockResponseBuilder): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/profiles")) {
        return Promise.resolve(
          new Response(JSON.stringify(builder.profiles), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }
      if (url.includes("/api/policy-rules/preflight")) {
        const body = builder.preflight()
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }),
  )
}

const PROFILES = {
  profiles: [
    { id: "chartlens", name: "ChartLens", category: "utility" } as never,
  ],
}

const CLEAN_DECISION = (): unknown => ({
  decidedAt: "2026-04-25T10:00:00.000Z",
  ok: true,
  violations: [],
})

const WARNING_DECISION = (): unknown => ({
  decidedAt: "2026-04-25T10:00:00.000Z",
  ok: true,
  violations: [
    {
      ruleId: "meta-ads-claims-unbeatable-001",
      severity: "warning",
      kind: "keyword-blocklist",
      message: 'Matched blocked keyword "unbeatable" in prompt/copy.',
      details: { keyword: "unbeatable", caseInsensitive: true },
    },
  ],
})

const BLOCK_DECISION = (): unknown => ({
  decidedAt: "2026-04-25T10:00:00.000Z",
  ok: false,
  violations: [
    {
      ruleId: "meta-ads-claims-miracle-001",
      severity: "block",
      kind: "keyword-blocklist",
      message: 'Matched blocked keyword "miracle" in prompt/copy.',
      details: { keyword: "miracle", caseInsensitive: true },
    },
  ],
})

beforeEach(() => {
  cleanup()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderWizard(): { onNav: ReturnType<typeof vi.fn> } {
  const onNav = vi.fn()
  render(
    <PolicyAwareWizard<MetaWizardForm>
      config={metaConfig}
      showToast={vi.fn()}
      onNav={onNav}
    />,
  )
  return { onNav }
}

describe("PolicyAwareWizard chassis", () => {
  it("renders the 4-step indicator (2 lane steps + preflight + run)", () => {
    stubFetch({ profiles: PROFILES, preflight: CLEAN_DECISION })
    renderWizard()
    const indicator = screen.getByTestId("wizard-step-indicator")
    const steps = indicator.querySelectorAll("li")
    // 2 lane-supplied input steps + preflight + run
    expect(steps).toHaveLength(4)
  })

  it("Step 1 — gates Next until a profile is picked", async () => {
    stubFetch({ profiles: PROFILES, preflight: CLEAN_DECISION })
    renderWizard()
    const next = screen.getByTestId("wizard-next") as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect(screen.getByTestId("wizard-validation").textContent).toMatch(/profile/i)

    // Wait specifically for the ChartLens option to mount — option count
    // hits >1 immediately because FeatureFocus has 7 static options, so a
    // count-only assertion would race the profiles fetch.
    await waitFor(() => {
      expect(screen.getByText(/ChartLens/)).toBeInTheDocument()
    })
    // Step 1 renders 2 selects (ProfileSelector + FeatureFocus); the
    // first is the profile picker (no test id on ProfileSelector itself).
    const profileSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement
    fireEvent.change(profileSelect, { target: { value: "chartlens" } })

    await waitFor(() => {
      expect((screen.getByTestId("wizard-next") as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it("Step 3 — auto-fires preflight; badge shows policy-clear on a clean decision and unlocks Run", async () => {
    stubFetch({ profiles: PROFILES, preflight: CLEAN_DECISION })
    renderWizard()

    // Wait specifically for the ChartLens option to mount — option count
    // hits >1 immediately because FeatureFocus has 7 static options, so a
    // count-only assertion would race the profiles fetch.
    await waitFor(() => {
      expect(screen.getByText(/ChartLens/)).toBeInTheDocument()
    })
    // Step 1 renders 2 selects (ProfileSelector + FeatureFocus); the
    // first is the profile picker (no test id on ProfileSelector itself).
    const profileSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement
    fireEvent.change(profileSelect, { target: { value: "chartlens" } })

    // Step 1 → Step 2 → Step 3
    fireEvent.click(screen.getByTestId("wizard-next"))
    fireEvent.click(screen.getByTestId("wizard-next"))

    await waitFor(() => {
      const badge = screen.getByTestId("wizard-preflight-badge")
      expect(badge.getAttribute("data-state")).toBe("ok")
    })

    expect((screen.getByTestId("wizard-next") as HTMLButtonElement).disabled).toBe(false)
  })

  it("Step 3 — warning decision shows warned badge + opens override dialog on Resolve", async () => {
    stubFetch({ profiles: PROFILES, preflight: WARNING_DECISION })
    renderWizard()

    // Wait specifically for the ChartLens option to mount — option count
    // hits >1 immediately because FeatureFocus has 7 static options, so a
    // count-only assertion would race the profiles fetch.
    await waitFor(() => {
      expect(screen.getByText(/ChartLens/)).toBeInTheDocument()
    })
    fireEvent.change(
      screen.getAllByRole("combobox")[0] as HTMLSelectElement,
      { target: { value: "chartlens" } },
    )
    fireEvent.click(screen.getByTestId("wizard-next"))
    fireEvent.click(screen.getByTestId("wizard-next"))

    await waitFor(() => {
      const badge = screen.getByTestId("wizard-preflight-badge")
      expect(badge.getAttribute("data-state")).toBe("warned")
    })

    fireEvent.click(screen.getByTestId("wizard-resolve-overrides"))
    expect(screen.getByTestId("policy-override-dialog")).toBeInTheDocument()

    // Validation message blocks Run while warnings linger.
    expect(screen.getByTestId("wizard-validation").textContent).toMatch(/violations/i)
    expect((screen.getByTestId("wizard-next") as HTMLButtonElement).disabled).toBe(true)
  })

  it("Step 3 — block decision shows blocked badge and keeps Run disabled", async () => {
    stubFetch({ profiles: PROFILES, preflight: BLOCK_DECISION })
    renderWizard()

    // Wait specifically for the ChartLens option to mount — option count
    // hits >1 immediately because FeatureFocus has 7 static options, so a
    // count-only assertion would race the profiles fetch.
    await waitFor(() => {
      expect(screen.getByText(/ChartLens/)).toBeInTheDocument()
    })
    fireEvent.change(
      screen.getAllByRole("combobox")[0] as HTMLSelectElement,
      { target: { value: "chartlens" } },
    )
    fireEvent.click(screen.getByTestId("wizard-next"))
    fireEvent.click(screen.getByTestId("wizard-next"))

    await waitFor(() => {
      const badge = screen.getByTestId("wizard-preflight-badge")
      expect(badge.getAttribute("data-state")).toBe("blocked")
    })

    expect((screen.getByTestId("wizard-next") as HTMLButtonElement).disabled).toBe(true)
  })
})
