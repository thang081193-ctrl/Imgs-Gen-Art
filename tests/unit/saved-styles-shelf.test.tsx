// @vitest-environment jsdom
//
// S#38 — SavedStylesShelf integration smoke. Stubs the global fetch so
// the shelf hook resolves with fixture data; verifies kind badges,
// click navigation target, and the empty-personal-styles prompt
// (Q-38.D) behavior.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { SavedStylesShelf } from "@/client/home/SavedStylesShelf"
import type { SavedStyleDto } from "@/core/dto/saved-style-dto"

const PRESET: SavedStyleDto = {
  id: "style_preset_aso_phone",
  slug: "aso-phone-screenshots",
  name: "ASO Phone Screenshots",
  description: "Legacy phone-frame ASO preset",
  kind: "preset-legacy",
  promptTemplate: "ASO template",
  previewAssetId: null,
  previewAssetUrl: null,
  lanes: ["aso.play"],
  usageCount: 12,
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
}

const USER: SavedStyleDto = {
  id: "style_user_neon",
  slug: "neon-glow",
  name: "Neon Glow",
  description: null,
  kind: "user",
  promptTemplate: "Neon template",
  previewAssetId: "ast_abc",
  previewAssetUrl: "/api/assets/ast_abc/file",
  lanes: ["ads.meta"],
  usageCount: 0,
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
}

function stubFetch(payload: { styles: SavedStyleDto[] }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
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

describe("SavedStylesShelf", () => {
  it("renders preset + user cards with the right kind badge", async () => {
    stubFetch({ styles: [PRESET, USER] })
    render(<SavedStylesShelf onNav={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId(`saved-style-card-${PRESET.id}`)).toBeInTheDocument()
    })
    expect(
      screen.getByTestId(`saved-style-card-${PRESET.id}`),
    ).toHaveAttribute("data-kind", "preset-legacy")
    expect(
      screen.getByTestId(`saved-style-card-${USER.id}`),
    ).toHaveAttribute("data-kind", "user")
    // Preset usage > 0 → shows "used 12×".
    expect(screen.getByText(/used 12×/i)).toBeInTheDocument()
  })

  it("navigates to saved-style-detail with the clicked id", async () => {
    stubFetch({ styles: [PRESET, USER] })
    const onNav = vi.fn()
    render(<SavedStylesShelf onNav={onNav} />)

    await waitFor(() => {
      expect(screen.getByTestId(`saved-style-card-${USER.id}`)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId(`saved-style-card-${USER.id}`))
    expect(onNav).toHaveBeenCalledWith("saved-style-detail", { savedStyleId: USER.id })
  })

  it("shows the 'no personal styles yet' prompt when only presets exist (Q-38.D)", async () => {
    stubFetch({ styles: [PRESET] })
    render(<SavedStylesShelf onNav={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId(`saved-style-card-${PRESET.id}`)).toBeInTheDocument()
    })
    expect(screen.getByText(/Chưa có style cá nhân/i)).toBeInTheDocument()
  })

  it("hides the prompt once a user style exists", async () => {
    stubFetch({ styles: [PRESET, USER] })
    render(<SavedStylesShelf onNav={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId(`saved-style-card-${USER.id}`)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Chưa có style cá nhân/i)).not.toBeInTheDocument()
  })

  it("renders an error message when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    )
    render(<SavedStylesShelf onNav={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/Không tải được saved styles/i)).toBeInTheDocument()
    })
  })
})
