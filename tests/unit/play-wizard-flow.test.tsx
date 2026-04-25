// @vitest-environment jsdom
//
// Phase F2 (Session #44) — Play wizard integration test.
//
// Walks the Play config through the chassis end-to-end at the
// component level (no real fetch). Asserts Step 1 + 2 validate
// independently, that the locale toggle respects the 3-language cap
// (S#15 Q3), and that Step 3 fires preflight against the play
// platform endpoint.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { PlayWizard } from "@/client/pages/PlayWizard"

function stubFetch(decision: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/profiles")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              profiles: [
                { id: "chartlens", name: "ChartLens", category: "utility" },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
      }
      if (url.includes("/api/policy-rules/preflight")) {
        return Promise.resolve(
          new Response(JSON.stringify(decision), {
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

const CLEAN_DECISION = {
  decidedAt: "2026-04-25T10:00:00.000Z",
  ok: true,
  violations: [],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function makeNavigator() {
  return {
    page: "wizard-play-aso" as const,
    params: {},
    go: vi.fn(),
    registerGuard: vi.fn(),
    unregisterGuard: vi.fn(),
  }
}

describe("Play wizard flow", () => {
  it("Step 1 → Step 2 → Step 3 walkthrough fires preflight against /api/policy-rules/preflight", async () => {
    stubFetch(CLEAN_DECISION)
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    render(
      <PlayWizard navigator={makeNavigator()} showToast={vi.fn()} />,
    )

    await waitFor(() => {
      expect(screen.getByText(/ChartLens/)).toBeInTheDocument()
    })
    fireEvent.change(
      screen.getAllByRole("combobox")[0] as HTMLSelectElement,
      { target: { value: "chartlens" } },
    )
    fireEvent.click(screen.getByTestId("wizard-next")) // → Step 2
    fireEvent.click(screen.getByTestId("wizard-next")) // → Step 3

    await waitFor(() => {
      const badge = screen.getByTestId("wizard-preflight-badge")
      expect(badge.getAttribute("data-state")).toBe("ok")
    })

    const preflightCalls = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("/api/policy-rules/preflight"),
    )
    expect(preflightCalls.length).toBeGreaterThanOrEqual(1)
    // Body shape — assert the platform discriminator is "play" so the
    // server-side router dispatches to the play rule set.
    const body = JSON.parse(
      (preflightCalls[0]![1] as { body: string }).body,
    ) as { platform: string }
    expect(body.platform).toBe("play")
  })

  it("Step 2 — locale toggle caps at 3 selections (S#15 Q3)", async () => {
    stubFetch(CLEAN_DECISION)
    render(<PlayWizard navigator={makeNavigator()} showToast={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/ChartLens/)).toBeInTheDocument()
    })
    fireEvent.change(
      screen.getAllByRole("combobox")[0] as HTMLSelectElement,
      { target: { value: "chartlens" } },
    )
    fireEvent.click(screen.getByTestId("wizard-next")) // → Step 2

    // Default selected: ["en"]. Add 2 more to hit cap.
    fireEvent.click(screen.getByTestId("play-lang-vi"))
    fireEvent.click(screen.getByTestId("play-lang-ja"))
    expect(screen.getByTestId("play-lang-en").getAttribute("data-selected")).toBe("true")
    expect(screen.getByTestId("play-lang-vi").getAttribute("data-selected")).toBe("true")
    expect(screen.getByTestId("play-lang-ja").getAttribute("data-selected")).toBe("true")

    // 4th click should be ignored (set already at 3 — S#15 Q3 cap).
    fireEvent.click(screen.getByTestId("play-lang-ko"))
    expect(screen.getByTestId("play-lang-ko").getAttribute("data-selected")).toBe("false")
  })
})
