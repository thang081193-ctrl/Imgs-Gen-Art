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

  // Session #29 Q-29.E — UI "0 of 3 checkboxes selected" must round-trip as an
  // empty array (distinct from absent) so the query builder can emit its
  // `1 = 0` match-none clause. Other plural fields keep the absent-on-empty
  // behavior.
  describe("replayClasses preserves present-but-empty", () => {
    it("absent key → undefined", () => {
      const r = AssetListFilterSchema.parse({})
      expect(r.replayClasses).toBeUndefined()
    })

    it("empty string value → [] (match-none sentinel)", () => {
      const r = AssetListFilterSchema.parse({ replayClasses: "" })
      expect(r.replayClasses).toEqual([])
    })

    it("single value → [value]", () => {
      const r = AssetListFilterSchema.parse({ replayClasses: "deterministic" })
      expect(r.replayClasses).toEqual(["deterministic"])
    })

    it("CSV preserves ordering + dedupes nothing (server wrapper handles set semantics)", () => {
      const r = AssetListFilterSchema.parse({
        replayClasses: "not_replayable,deterministic",
      })
      expect(r.replayClasses).toEqual(["not_replayable", "deterministic"])
    })

    it("other plural fields still collapse empty string → undefined", () => {
      const r = AssetListFilterSchema.parse({ profileIds: "", tags: "" })
      expect(r.profileIds).toBeUndefined()
      expect(r.tags).toBeUndefined()
    })
  })

  // Session #32 F3 — custom-range dateFrom/dateTo fields. Strict ISO-date
  // regex (YYYY-MM-DD) so a rogue timestamp or malformed value never flows
  // through to the SQL builder.
  describe("dateFrom / dateTo custom range", () => {
    it("accepts valid YYYY-MM-DD on both bounds", () => {
      const r = AssetListFilterSchema.parse({
        dateFrom: "2026-03-15",
        dateTo: "2026-03-20",
      })
      expect(r.dateFrom).toBe("2026-03-15")
      expect(r.dateTo).toBe("2026-03-20")
    })

    it("accepts a single bound (dateFrom only, dateTo only)", () => {
      const rFrom = AssetListFilterSchema.parse({ dateFrom: "2026-03-15" })
      expect(rFrom.dateFrom).toBe("2026-03-15")
      expect(rFrom.dateTo).toBeUndefined()

      const rTo = AssetListFilterSchema.parse({ dateTo: "2026-03-20" })
      expect(rTo.dateFrom).toBeUndefined()
      expect(rTo.dateTo).toBe("2026-03-20")
    })

    it("rejects non-ISO date formats", () => {
      expect(AssetListFilterSchema.safeParse({ dateFrom: "03/15/2026" }).success).toBe(false)
      expect(AssetListFilterSchema.safeParse({ dateFrom: "2026-03-15T12:00:00Z" }).success).toBe(false)
      expect(AssetListFilterSchema.safeParse({ dateTo: "not-a-date" }).success).toBe(false)
    })

    it("custom range coexists with datePreset in schema (precedence enforced at builder layer)", () => {
      const r = AssetListFilterSchema.parse({
        datePreset: "7d",
        dateFrom: "2026-03-15",
      })
      expect(r.datePreset).toBe("7d")
      expect(r.dateFrom).toBe("2026-03-15")
    })
  })
})
