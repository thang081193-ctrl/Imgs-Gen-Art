// @vitest-environment jsdom
//
// Phase C2 (Session #42) — PolicyRulesBanner React unit tests.
// Stubs global fetch so usePolicyRulesStatus + useRescrapePolicyRules
// drive through the real hooks. Coverage:
//   - hidden when status.isStale === false
//   - hidden when sessionStorage.policyBannerDismissed === "1"
//   - rendered + Refresh CTA fires POST + success toast
//   - failure path → danger toast
//   - Dismiss persists "1" into sessionStorage and removes the banner

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"

import { PolicyRulesBanner } from "@/client/components/PolicyRulesBanner"
import type {
  PolicyRulesStatus,
  RescrapeResult,
} from "@/client/api/policy-rules-hooks"

const STALE_STATUS: PolicyRulesStatus = {
  lastScrapedAt: "2025-12-01T00:00:00.000Z",
  daysSince: 145,
  stalenessThresholdDays: 14,
  isStale: true,
  perPlatform: [
    { platform: "meta", scrapedAt: "2025-12-01T00:00:00.000Z", contentHash: null, sourceUrl: null },
    { platform: "google-ads", scrapedAt: null, contentHash: null, sourceUrl: null },
    { platform: "play", scrapedAt: null, contentHash: null, sourceUrl: null },
  ],
}

const FRESH_STATUS: PolicyRulesStatus = { ...STALE_STATUS, daysSince: 3, isStale: false }

const RESCRAPE_OK: RescrapeResult = {
  ok: [
    {
      platform: "meta",
      scrapedAt: "2026-04-25T08:00:00.000Z",
      sourceUrl: "https://example.com",
      contentHash: "a".repeat(64),
      contentExcerpt: "x",
      changedFromPrev: true,
    },
  ],
  failed: [],
  lastScrapedAt: "2026-04-25T08:00:00.000Z",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

interface ToastCall {
  variant?: string
  message: string
}

function makeToastSpy(): { toasts: ToastCall[]; show: (input: ToastCall) => void } {
  const toasts: ToastCall[] = []
  return { toasts, show: (input) => { toasts.push(input) } }
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

describe("PolicyRulesBanner — visibility", () => {
  it("renders nothing when status is fresh (isStale=false)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(FRESH_STATUS)),
    )
    const toast = makeToastSpy()
    render(<PolicyRulesBanner showToast={toast.show} />)
    await waitFor(() => {
      expect(screen.queryByTestId("policy-rules-banner")).not.toBeInTheDocument()
    })
  })

  it("renders when status is stale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(STALE_STATUS)),
    )
    const toast = makeToastSpy()
    render(<PolicyRulesBanner showToast={toast.show} />)
    await waitFor(() => {
      expect(screen.getByTestId("policy-rules-banner")).toBeInTheDocument()
    })
    expect(screen.getByText(/last scraped/i)).toHaveTextContent("145 days ago")
  })

  it("hidden when sessionStorage.policyBannerDismissed === '1'", async () => {
    window.sessionStorage.setItem("policyBannerDismissed", "1")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(STALE_STATUS)),
    )
    const toast = makeToastSpy()
    render(<PolicyRulesBanner showToast={toast.show} />)
    // Wait a microtask so the fetch resolves but banner stays hidden.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId("policy-rules-banner")).not.toBeInTheDocument()
  })
})

describe("PolicyRulesBanner — refresh CTA", () => {
  it("Refresh now → POST /rescrape → success toast", async () => {
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/policy-rules/status")) return jsonResponse(STALE_STATUS)
      if (url.includes("/api/policy-rules/rescrape")) {
        expect(init?.method).toBe("POST")
        return jsonResponse(RESCRAPE_OK)
      }
      throw new Error(`unexpected URL ${url}`)
    })
    vi.stubGlobal("fetch", fetchSpy)
    const toast = makeToastSpy()
    render(<PolicyRulesBanner showToast={toast.show} />)

    const btn = await screen.findByRole("button", { name: /refresh now/i })
    await act(async () => { btn.click() })

    await waitFor(() => {
      expect(toast.toasts).toHaveLength(1)
    })
    expect(toast.toasts[0]?.variant).toBe("success")
    expect(toast.toasts[0]?.message).toMatch(/re-scrape 1 platform/i)
  })

  it("on rescrape error → danger toast", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/api/policy-rules/status")) return jsonResponse(STALE_STATUS)
      if (url.includes("/api/policy-rules/rescrape")) {
        return new Response(
          JSON.stringify({ code: "INTERNAL", message: "boom" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        )
      }
      throw new Error(`unexpected URL ${url}`)
    })
    vi.stubGlobal("fetch", fetchSpy)
    const toast = makeToastSpy()
    render(<PolicyRulesBanner showToast={toast.show} />)

    const btn = await screen.findByRole("button", { name: /refresh now/i })
    await act(async () => {
      try { btn.click() } catch { /* surfaced as toast */ }
    })

    await waitFor(() => {
      expect(toast.toasts).toHaveLength(1)
    })
    expect(toast.toasts[0]?.variant).toBe("danger")
  })
})

describe("PolicyRulesBanner — dismiss", () => {
  it("Dismiss writes sessionStorage and hides the banner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(STALE_STATUS)),
    )
    const toast = makeToastSpy()
    render(<PolicyRulesBanner showToast={toast.show} />)

    const dismiss = await screen.findByRole("button", { name: /dismiss/i })
    await act(async () => { dismiss.click() })

    await waitFor(() => {
      expect(screen.queryByTestId("policy-rules-banner")).not.toBeInTheDocument()
    })
    expect(window.sessionStorage.getItem("policyBannerDismissed")).toBe("1")
  })
})
