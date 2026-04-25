// Phase E (Session #44) — google-ads prompt composer + parser tests.
//
// `buildGoogleAdsPrompt` is the deterministic instruction handed to the
// LLM; `parseGoogleAdsResponse` is the JSON-out parser; `synthesize…`
// is the deterministic fallback used when no LLM is wired. All three
// are pure → trivial round-trips.

import { describe, expect, it } from "vitest"

import type { AppProfile } from "@/core/schemas/app-profile"
import {
  buildGoogleAdsPrompt,
  parseGoogleAdsResponse,
  synthesizeGoogleAdsResponse,
} from "@/workflows/google-ads"

const profile: AppProfile = {
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

describe("buildGoogleAdsPrompt", () => {
  it("includes profile name + tagline + featureFocus + counts", () => {
    const out = buildGoogleAdsPrompt({
      profile,
      featureFocus: "restore",
      headlineCount: 5,
      descriptionCount: 3,
    })
    expect(out).toContain("ChartLens")
    expect(out).toContain("Instant chart reader")
    expect(out).toContain("Feature focus: restore")
    expect(out).toContain("5 headlines")
    expect(out).toContain("3 descriptions")
    expect(out).toMatch(/strict JSON/i)
  })

  it("respects do/dont lists when populated", () => {
    const out = buildGoogleAdsPrompt({
      profile,
      featureFocus: "restore",
      headlineCount: 3,
      descriptionCount: 2,
    })
    expect(out).toMatch(/Must include themes: clean grid/)
    expect(out).toMatch(/Avoid themes: clutter/)
  })
})

describe("parseGoogleAdsResponse", () => {
  it("parses a clean JSON envelope", () => {
    const raw =
      '{"headlines":["H1","H2"],"descriptions":["D1","D2","D3"]}'
    const parsed = parseGoogleAdsResponse(raw)
    expect(parsed.headlines).toEqual(["H1", "H2"])
    expect(parsed.descriptions).toEqual(["D1", "D2", "D3"])
  })

  it("tolerates surrounding prose by extracting the first JSON object", () => {
    const raw =
      'Sure! Here are your ads:\n{"headlines":["A"],"descriptions":["B"]}\nLet me know if you need more.'
    const parsed = parseGoogleAdsResponse(raw)
    expect(parsed.headlines).toEqual(["A"])
    expect(parsed.descriptions).toEqual(["B"])
  })

  it("throws on missing JSON envelope", () => {
    expect(() => parseGoogleAdsResponse("no json here")).toThrow(
      /missing JSON object/,
    )
  })

  it("throws when headlines/descriptions are not arrays", () => {
    expect(() =>
      parseGoogleAdsResponse('{"headlines":"oops","descriptions":[]}'),
    ).toThrow(/missing headlines\/descriptions arrays/)
  })
})

describe("synthesizeGoogleAdsResponse — deterministic fallback", () => {
  it("produces exactly N headlines + M descriptions", () => {
    const out = synthesizeGoogleAdsResponse({
      profile,
      featureFocus: "restore",
      headlineCount: 4,
      descriptionCount: 2,
    })
    expect(out.headlines).toHaveLength(4)
    expect(out.descriptions).toHaveLength(2)
    expect(out.headlines[0]).toMatch(/ChartLens/)
    expect(out.descriptions[0]).toMatch(/Instant chart reader/)
  })
})
