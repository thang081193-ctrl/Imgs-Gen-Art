// Phase 5 Step 3b (Session #29) — URL round-trip contract between
// `buildAssetsQueryString` (client) and `AssetListFilterSchema` (server).
// Guards against client/server encoding drift as new filter dimensions land.
//
// Why not a full Gallery mount test: requires jsdom (carry-forward #5), which
// is still deferred. Round-tripping the pure encoder through the schema
// covers the exact same contract the Gallery's `history.replaceState` relies
// on.

import { describe, expect, it } from "vitest"

import { buildAssetsQueryString } from "@/client/api/hooks"
import type { AssetsFilter } from "@/client/api/hooks"
import { AssetListFilterSchema } from "@/core/schemas/asset-list-filter"

function roundTrip(filter: AssetsFilter): ReturnType<typeof AssetListFilterSchema.parse> {
  const qs = buildAssetsQueryString(filter)
  const params = new URLSearchParams(qs)
  const raw: Record<string, string> = {}
  for (const [k, v] of params.entries()) raw[k] = v
  return AssetListFilterSchema.parse(raw)
}

describe("buildAssetsQueryString — absent dimensions", () => {
  it("empty filter → only limit + offset", () => {
    expect(buildAssetsQueryString({})).toBe("limit=50&offset=0")
  })

  it("empty filter round-trips to schema with defaults", () => {
    const parsed = roundTrip({})
    expect(parsed.profileIds).toBeUndefined()
    expect(parsed.replayClasses).toBeUndefined()
    expect(parsed.limit).toBe(50)
    expect(parsed.offset).toBe(0)
  })
})

describe("buildAssetsQueryString — CSV arrays", () => {
  it("encodes profileIds/workflowIds/tags as un-escaped commas between encoded values", () => {
    const qs = buildAssetsQueryString({
      profileIds: ["chartlens", "ai-chatbot"],
      tags: ["sunset", "neon"],
    })
    expect(qs).toContain("profileIds=chartlens,ai-chatbot")
    expect(qs).toContain("tags=sunset,neon")
  })

  it("percent-encodes special chars in tag values but keeps commas literal", () => {
    const qs = buildAssetsQueryString({ tags: ["café dusk", "moody/retro"] })
    expect(qs).toContain("tags=caf%C3%A9%20dusk,moody%2Fretro")
  })

  it("round-trips multi-value arrays through the schema", () => {
    const filter: AssetsFilter = {
      profileIds: ["chartlens", "ai-chatbot"],
      workflowIds: ["artwork-batch"],
      tags: ["sunset", "neon"],
      providerIds: ["gemini", "vertex"],
      modelIds: ["imagen-4.0-generate-001"],
    }
    const parsed = roundTrip(filter)
    expect(parsed.profileIds).toEqual(filter.profileIds)
    expect(parsed.workflowIds).toEqual(filter.workflowIds)
    expect(parsed.tags).toEqual(filter.tags)
    expect(parsed.providerIds).toEqual(filter.providerIds)
    expect(parsed.modelIds).toEqual(filter.modelIds)
  })
})

describe("buildAssetsQueryString — replayClasses match-none semantics", () => {
  it("undefined → absent key", () => {
    const qs = buildAssetsQueryString({})
    expect(qs).not.toContain("replayClasses")
  })

  it("[] → present-but-empty value", () => {
    const qs = buildAssetsQueryString({ replayClasses: [] })
    expect(qs).toContain("replayClasses=&")
  })

  it("[] round-trips to schema as empty array (match-none sentinel)", () => {
    const parsed = roundTrip({ replayClasses: [] })
    expect(parsed.replayClasses).toEqual([])
  })

  it("subset values round-trip", () => {
    const parsed = roundTrip({ replayClasses: ["deterministic", "best_effort"] })
    expect(parsed.replayClasses).toEqual(["deterministic", "best_effort"])
  })
})

describe("buildAssetsQueryString — scalar dimensions", () => {
  it("datePreset=all is omitted (same as absent)", () => {
    const qs = buildAssetsQueryString({ datePreset: "all" })
    expect(qs).not.toContain("datePreset")
  })

  it("datePreset=7d is emitted + round-trips", () => {
    const qs = buildAssetsQueryString({ datePreset: "7d" })
    expect(qs).toContain("datePreset=7d")
    const parsed = roundTrip({ datePreset: "7d" })
    expect(parsed.datePreset).toBe("7d")
  })

  it("tagMatchMode=all round-trips", () => {
    const parsed = roundTrip({ tags: ["a", "b"], tagMatchMode: "all" })
    expect(parsed.tagMatchMode).toBe("all")
    expect(parsed.tags).toEqual(["a", "b"])
  })

  it("batchId percent-encodes special characters", () => {
    const qs = buildAssetsQueryString({ batchId: "batch id with spaces" })
    expect(qs).toContain("batchId=batch%20id%20with%20spaces")
  })
})

describe("buildAssetsQueryString — full filter round-trip", () => {
  it("every dimension together survives the round-trip", () => {
    const filter: AssetsFilter = {
      profileIds: ["chartlens"],
      workflowIds: ["artwork-batch"],
      tags: ["sunset", "neon"],
      tagMatchMode: "all",
      datePreset: "30d",
      providerIds: ["gemini"],
      modelIds: ["imagen-4.0-generate-001"],
      replayClasses: ["deterministic"],
      batchId: "batch_xyz",
      limit: 25,
      offset: 50,
    }
    const parsed = roundTrip(filter)
    expect(parsed).toEqual({
      profileIds: ["chartlens"],
      workflowIds: ["artwork-batch"],
      tags: ["sunset", "neon"],
      tagMatchMode: "all",
      datePreset: "30d",
      providerIds: ["gemini"],
      modelIds: ["imagen-4.0-generate-001"],
      replayClasses: ["deterministic"],
      batchId: "batch_xyz",
      limit: 25,
      offset: 50,
    })
  })
})
