// Session #28 (Phase 5 Step 3) — AssetListFilterSchema.
// Covers: strict allowlist, CSV preprocess, enum bounds, limit clamp,
// legacy singular → plural merge.

import { describe, it, expect } from "vitest"
import {
  AssetListFilterSchema,
  DatePresetValues,
  ReplayClassValues,
  TagMatchModeValues,
  emptyAssetListFilter,
} from "@/core/schemas/asset-list-filter"

describe("AssetListFilterSchema", () => {
  it("parses an empty query with defaults (limit=50, offset=undefined)", () => {
    const r = AssetListFilterSchema.parse({})
    expect(r.limit).toBe(50)
    expect(r.offset).toBeUndefined()
    expect(r.profileIds).toBeUndefined()
    expect(r.tagMatchMode).toBeUndefined()
    expect(r.datePreset).toBeUndefined()
  })

  it("splits CSV strings into arrays (profileIds, workflowIds, tags)", () => {
    const r = AssetListFilterSchema.parse({
      profileIds: "chartlens,ai-chatbot",
      workflowIds: "artwork-batch,ad-production",
      tags: "sunset,neon,retro",
    })
    expect(r.profileIds).toEqual(["chartlens", "ai-chatbot"])
    expect(r.workflowIds).toEqual(["artwork-batch", "ad-production"])
    expect(r.tags).toEqual(["sunset", "neon", "retro"])
  })

  it("empty string CSV collapses to undefined (not an empty array)", () => {
    const r = AssetListFilterSchema.parse({ profileIds: "", tags: "   " })
    expect(r.profileIds).toBeUndefined()
    expect(r.tags).toBeUndefined()
  })

  it("merges legacy singular profileId / workflowId into plurals", () => {
    const r = AssetListFilterSchema.parse({
      profileId: "chartlens",
      workflowId: "artwork-batch",
    })
    expect(r.profileIds).toEqual(["chartlens"])
    expect(r.workflowIds).toEqual(["artwork-batch"])
  })

  it("plural wins when both singular and plural are provided", () => {
    const r = AssetListFilterSchema.parse({
      profileId: "legacy",
      profileIds: "new-a,new-b",
    })
    expect(r.profileIds).toEqual(["new-a", "new-b"])
  })

  it("rejects unknown keys (strict allowlist)", () => {
    const r = AssetListFilterSchema.safeParse({ unknownKey: "x" })
    expect(r.success).toBe(false)
  })

  it("rejects invalid enum values (datePreset, replayClasses)", () => {
    expect(AssetListFilterSchema.safeParse({ datePreset: "yesterday" }).success).toBe(false)
    expect(AssetListFilterSchema.safeParse({ replayClasses: "mystery" }).success).toBe(false)
    expect(AssetListFilterSchema.safeParse({ tagMatchMode: "maybe" }).success).toBe(false)
  })

  it("accepts valid enum CSV for replayClasses + tagMatchMode + datePreset", () => {
    const r = AssetListFilterSchema.parse({
      replayClasses: "deterministic,best_effort",
      tagMatchMode: "all",
      datePreset: "7d",
    })
    expect(r.replayClasses).toEqual(["deterministic", "best_effort"])
    expect(r.tagMatchMode).toBe("all")
    expect(r.datePreset).toBe("7d")
  })

  it("coerces limit + offset from string query params", () => {
    const r = AssetListFilterSchema.parse({ limit: "25", offset: "100" })
    expect(r.limit).toBe(25)
    expect(r.offset).toBe(100)
  })

  it("rejects limit > 100 and negative offset", () => {
    expect(AssetListFilterSchema.safeParse({ limit: "200" }).success).toBe(false)
    expect(AssetListFilterSchema.safeParse({ offset: "-1" }).success).toBe(false)
  })

  it("has exhaustive enum value lists matching the ReplayClass type", () => {
    expect(ReplayClassValues).toEqual(["deterministic", "best_effort", "not_replayable"])
    expect(DatePresetValues).toEqual(["all", "today", "7d", "30d"])
    expect(TagMatchModeValues).toEqual(["any", "all"])
  })

  it("emptyAssetListFilter returns a valid AssetListFilter with only limit set", () => {
    const f = emptyAssetListFilter()
    expect(f.limit).toBe(50)
    expect(f.tagMatchMode).toBeUndefined()
    expect(f.profileIds).toBeUndefined()
  })
})
