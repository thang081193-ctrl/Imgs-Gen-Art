// Session #39 Phase B1 — fallback reverse-from-image stub unit tests.

import { describe, expect, it, vi } from "vitest"

import type { AppProfile } from "@/core/schemas/app-profile"

const FAKE_PROFILE: AppProfile = {
  version: 2,
  id: "demo-app",
  name: "Demo App",
  tagline: "fast tasks",
  category: "productivity",
  assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
  visual: {
    primaryColor: "#000000",
    secondaryColor: "#111111",
    accentColor: "#222222",
    tone: "minimal",
    doList: [],
    dontList: [],
  },
  positioning: { usp: "instant capture", targetPersona: "indie devs", marketTier: "tier1" },
  context: { features: [], keyScenarios: [], forbiddenContent: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

vi.mock("@/server/profile-repo", () => ({
  tryLoadProfile: vi.fn((id: string) => (id === "demo-app" ? FAKE_PROFILE : null)),
}))

import { composeReverseFromImageFallback } from "@/server/services/prompt-assist/fallback-reverse"

describe("composeReverseFromImageFallback", () => {
  it("emits generic template when no profile + no lane", () => {
    const r = composeReverseFromImageFallback({})
    expect(r.fromFallback).toBe(true)
    expect(r.prompt).toContain("creative")
    expect(r.notes).toEqual([
      "LLM offline — generic reverse template (no profile context)",
    ])
  })

  it("emits lane + platform surface when provided", () => {
    const r = composeReverseFromImageFallback({ lane: "ads.meta", platform: "story" })
    expect(r.prompt).toContain("ads.meta (story)")
  })

  it("includes brand context line when profile resolves", () => {
    const r = composeReverseFromImageFallback({ profileId: "demo-app", lane: "aso.play" })
    expect(r.prompt).toContain("Demo App")
    expect(r.prompt).toContain("instant capture")
    expect(r.prompt).toContain("minimal")
    expect(r.notes).toEqual([
      "LLM offline — generic reverse template anchored on profile",
    ])
  })
})
