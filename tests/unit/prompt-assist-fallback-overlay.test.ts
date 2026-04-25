// Session #39 Phase B1 — fallback overlay (5-template brainstorm) unit tests.

import { describe, expect, it, vi } from "vitest"

import type { AppProfile } from "@/core/schemas/app-profile"

const FAKE_PROFILE: AppProfile = {
  version: 2,
  id: "demo-app",
  name: "Demo App",
  tagline: "do everything fast",
  category: "productivity",
  assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
  visual: {
    primaryColor: "#112233",
    secondaryColor: "#445566",
    accentColor: "#aabbcc",
    tone: "bold",
    doList: [],
    dontList: [],
  },
  positioning: {
    usp: "fastest task entry",
    targetPersona: "PMs",
    marketTier: "global",
  },
  context: { features: [], keyScenarios: [], forbiddenContent: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

vi.mock("@/server/profile-repo", () => ({
  tryLoadProfile: vi.fn((id: string) => (id === "demo-app" ? FAKE_PROFILE : null)),
}))

import { composeTextOverlayBrainstorm } from "@/server/services/prompt-assist/fallback-overlay"

describe("composeTextOverlayBrainstorm", () => {
  it("returns 5 tone-labelled lines", () => {
    const r = composeTextOverlayBrainstorm({})
    const lines = r.prompt.split("\n")
    expect(lines).toHaveLength(5)
    expect(lines[0]!.startsWith("[bold]")).toBe(true)
    expect(lines[1]!.startsWith("[playful]")).toBe(true)
    expect(lines[2]!.startsWith("[minimal]")).toBe(true)
    expect(lines[3]!.startsWith("[urgency]")).toBe(true)
    expect(lines[4]!.startsWith("[social-proof]")).toBe(true)
    expect(r.fromFallback).toBe(true)
  })

  it("interpolates profile name + USP when profileId resolves", () => {
    const r = composeTextOverlayBrainstorm({ profileId: "demo-app", headline: "Ship faster" })
    expect(r.prompt).toContain("Demo App")
    expect(r.prompt).toContain("fastest task entry")
    expect(r.prompt).toContain("Ship faster")
  })

  it("uses placeholder strings without profile", () => {
    const r = composeTextOverlayBrainstorm({})
    expect(r.prompt).toContain("your headline here")
    expect(r.prompt).toContain("your app")
  })

  it("trims headline + falls back to placeholder on empty", () => {
    const r = composeTextOverlayBrainstorm({ headline: "   " })
    expect(r.prompt).toContain("your headline here")
  })
})
