// Phase D1 (Session #44) — unit tests for build-check-input mappers.
//
// Round-trips the runner-supplied surface (profile + composed prompt +
// copy texts + aspectRatio) through `buildMetaCheckInput` and asserts
// the PolicyCheckInput field-for-field. The Google Ads + Play helpers
// are stubbed in D1 — these tests pin that stub state so a half-shipped
// E/F1 doesn't slip through unnoticed.

import { describe, expect, it } from "vitest"

import type { AppProfile } from "@/core/schemas/app-profile"
import {
  buildGoogleAdsCheckInput,
  buildMetaCheckInput,
  buildPlayCheckInput,
} from "@/server/services/policy-rules/build-check-input"

const profileFixture: AppProfile = {
  version: 1,
  id: "chartlens",
  name: "ChartLens",
  tagline: "Instant chart reader",
  category: "utility",
  assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
  visual: {
    primaryColor: "#111111",
    secondaryColor: "#ff66cc",
    accentColor: "#00ccff",
    tone: "minimal",
    doList: ["clean grid"],
    dontList: ["clutter"],
  },
  positioning: { usp: "Snap a chart", targetPersona: "traders", marketTier: "global" },
  context: { features: [], keyScenarios: [], forbiddenContent: [] },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
} as AppProfile

describe("buildMetaCheckInput", () => {
  it("packages prompt + copyTexts + aspectRatio with platform='meta'", () => {
    const out = buildMetaCheckInput({
      profile: profileFixture,
      prompt: "App ad visualization for ChartLens.",
      copyTexts: ["See clearly", "Fast"],
      aspectRatio: "1:1",
    })
    expect(out).toEqual({
      platform: "meta",
      prompt: "App ad visualization for ChartLens.",
      copyTexts: ["See clearly", "Fast"],
      assetAspectRatio: "1:1",
    })
  })

  it("does NOT supply asset-* dimensions (Q-44.B — per-asset gating deferred)", () => {
    const out = buildMetaCheckInput({
      profile: profileFixture,
      prompt: "x",
      copyTexts: [],
      aspectRatio: "9:16",
    })
    expect(out.assetWidth).toBeUndefined()
    expect(out.assetHeight).toBeUndefined()
    expect(out.assetFileSizeBytes).toBeUndefined()
    // assetAspectRatio is the only asset-side hint we surface at preflight.
    expect(out.assetAspectRatio).toBe("9:16")
  })

  it("preserves an empty copyTexts array verbatim (no nullification)", () => {
    const out = buildMetaCheckInput({
      profile: profileFixture,
      prompt: "x",
      copyTexts: [],
      aspectRatio: "1:1",
    })
    expect(out.copyTexts).toEqual([])
  })
})

describe("buildGoogleAdsCheckInput / buildPlayCheckInput — D1 placeholders", () => {
  it("buildGoogleAdsCheckInput throws until Phase E un-stubs", () => {
    expect(() => buildGoogleAdsCheckInput()).toThrow(/Phase E/)
  })

  it("buildPlayCheckInput throws until Phase F1 un-stubs", () => {
    expect(() => buildPlayCheckInput()).toThrow(/Phase F1/)
  })
})
