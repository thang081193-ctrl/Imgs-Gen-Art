// Session #39 Phase B1 — fallback idea-to-prompt composer unit tests.
//
// Verifies profile + idea weave per lane + graceful generic stub when no
// profileId. Uses vi.mock to substitute profile-repo so we don't need a
// fixture file on disk.

import { beforeEach, describe, expect, it, vi } from "vitest"

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
    doList: ["clean type", "vivid CTA"],
    dontList: ["clutter", "stock photos"],
  },
  positioning: {
    usp: "fastest task entry on iOS",
    targetPersona: "PM swamped with meetings",
    marketTier: "global",
  },
  context: {
    features: ["voice capture", "shared lists"],
    keyScenarios: ["between meetings"],
    forbiddenContent: ["competitor names"],
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

vi.mock("@/server/profile-repo", () => ({
  tryLoadProfile: vi.fn((id: string) => (id === "demo-app" ? FAKE_PROFILE : null)),
}))

import { composeIdeaToPrompt } from "@/server/services/prompt-assist/fallback-composer"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("composeIdeaToPrompt — with profile", () => {
  it("ads.meta lane weaves profile facts + idea + platform", () => {
    const result = composeIdeaToPrompt({
      idea: "winter sale push",
      lane: "ads.meta",
      platform: "feed",
      profileId: "demo-app",
    })
    expect(result.fromFallback).toBe(true)
    expect(result.prompt).toContain("Demo App")
    expect(result.prompt).toContain("Meta (feed)")
    expect(result.prompt).toContain("fastest task entry on iOS")
    expect(result.prompt).toContain("PM swamped with meetings")
    expect(result.prompt).toContain("winter sale push")
    expect(result.prompt).toContain("clean type")
    expect(result.prompt).toContain("clutter")
    expect(result.prompt).toContain("competitor names")
    expect(result.notes).toEqual(["LLM offline — composed from profile + idea"])
  })

  it("ads.google-ads lane uses Google Ads channel label", () => {
    const r = composeIdeaToPrompt({
      idea: "remarketing ABM",
      lane: "ads.google-ads",
      profileId: "demo-app",
    })
    expect(r.prompt).toContain("Google Ads")
    expect(r.prompt).toContain("remarketing ABM")
  })

  it("aso.play lane mentions Play Store + first feature", () => {
    const r = composeIdeaToPrompt({
      idea: "highlight quick capture",
      lane: "aso.play",
      profileId: "demo-app",
    })
    expect(r.prompt).toContain("Play Store screenshot")
    expect(r.prompt).toContain("voice capture")
    expect(r.prompt).toContain("highlight quick capture")
  })

  it("artwork-batch lane emits brand artwork composition", () => {
    const r = composeIdeaToPrompt({
      idea: "minimal hero on dark",
      lane: "artwork-batch",
      profileId: "demo-app",
    })
    expect(r.prompt).toContain("brand artwork for Demo App")
    expect(r.prompt).toContain("#112233")
    expect(r.prompt).toContain("#aabbcc")
    expect(r.prompt).toContain("minimal hero on dark")
  })
})

describe("composeIdeaToPrompt — without profile", () => {
  it("uses generic stub when profileId unset", () => {
    const r = composeIdeaToPrompt({ idea: "anything", lane: "ads.meta" })
    expect(r.fromFallback).toBe(true)
    expect(r.prompt).toContain("anything")
    expect(r.prompt).not.toContain("Demo App")
    expect(r.notes).toEqual(["LLM offline — generic template (no profile context)"])
  })

  it("uses generic stub when profileId is unknown", () => {
    const r = composeIdeaToPrompt({
      idea: "abc",
      lane: "aso.play",
      profileId: "missing",
    })
    expect(r.notes).toEqual(["LLM offline — generic template (no profile context)"])
    expect(r.prompt).toContain("aso.play")
  })
})
