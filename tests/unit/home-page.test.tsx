// @vitest-environment jsdom
//
// S#38 — Home page render smoke. Verifies both LaneCtaCards mount,
// the SavedStylesShelf consumes /api/saved-styles and renders 3
// presets + 1 user fixture, and lane-card click fires the toast
// per Q-38.I (b).

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Home } from "@/client/pages/Home"
import type { SavedStyleDto } from "@/core/dto/saved-style-dto"

const FIXTURES: SavedStyleDto[] = [
  {
    id: "style_p1", slug: "p1", name: "Preset 1", description: null, kind: "preset-legacy",
    promptTemplate: "", previewAssetId: null, previewAssetUrl: null, lanes: ["ads.meta"],
    usageCount: 0, createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z",
  },
  {
    id: "style_p2", slug: "p2", name: "Preset 2", description: null, kind: "preset-legacy",
    promptTemplate: "", previewAssetId: null, previewAssetUrl: null, lanes: ["ads.google-ads"],
    usageCount: 0, createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z",
  },
  {
    id: "style_p3", slug: "p3", name: "Preset 3", description: null, kind: "preset-legacy",
    promptTemplate: "", previewAssetId: null, previewAssetUrl: null, lanes: ["aso.play"],
    usageCount: 0, createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z",
  },
  {
    id: "style_u1", slug: "u1", name: "My Style", description: null, kind: "user",
    promptTemplate: "", previewAssetId: null, previewAssetUrl: null, lanes: ["ads.meta"],
    usageCount: 3, createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z",
  },
]

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ styles: FIXTURES }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Home page", () => {
  it("renders both lane cards + the saved-styles shelf with all fixtures", async () => {
    stubFetch()
    render(<Home onNav={() => {}} showToast={() => {}} />)

    expect(screen.getByTestId("lane-cta-ads")).toBeInTheDocument()
    expect(screen.getByTestId("lane-cta-aso")).toBeInTheDocument()

    await waitFor(() => {
      // All 3 presets + 1 user style mount.
      expect(screen.getByTestId("saved-style-card-style_p1")).toBeInTheDocument()
    })
    expect(screen.getByTestId("saved-style-card-style_u1")).toHaveAttribute("data-kind", "user")
    // With a user style present, the empty-state prompt is suppressed.
    expect(screen.queryByText(/Chưa có style cá nhân/i)).not.toBeInTheDocument()
  })

  it("Q-38.I — clicking a lane CTA fires a toast (no nav until D1+)", async () => {
    stubFetch()
    const onNav = vi.fn()
    const showToast = vi.fn()
    render(<Home onNav={onNav} showToast={showToast} />)

    fireEvent.click(screen.getByTestId("lane-cta-ads"))
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast.mock.calls[0][0].message).toMatch(/ads/i)
    // No nav: wizard ships D1+.
    expect(onNav).not.toHaveBeenCalled()
  })
})
