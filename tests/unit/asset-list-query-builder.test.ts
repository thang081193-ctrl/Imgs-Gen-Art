// Session #28 (Phase 5 Step 3) — buildAssetListQuery.
// Pure SQL-string tests: no DB. Verifies clause composition, param ordering,
// tag LIKE escape, date preset boundaries.

import { describe, it, expect } from "vitest"
import {
  buildAssetListQuery,
  datePresetBoundary,
} from "@/server/asset-store/asset-list-query"
import { emptyAssetListFilter } from "@/core/schemas/asset-list-filter"

describe("buildAssetListQuery — empty filter", () => {
  it("produces a WHERE-less query with LIMIT + OFFSET only", () => {
    const { sql, params } = buildAssetListQuery(emptyAssetListFilter())
    expect(sql).toBe("SELECT * FROM assets  ORDER BY created_at DESC LIMIT ? OFFSET ?")
    expect(params).toEqual([50, 0])
  })
})

describe("buildAssetListQuery — single dimensions", () => {
  it("profileIds → profile_id IN (...)", () => {
    const { sql, params } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      profileIds: ["chartlens", "ai-chatbot"],
    })
    expect(sql).toContain("profile_id IN (?, ?)")
    expect(params.slice(0, 2)).toEqual(["chartlens", "ai-chatbot"])
  })

  it("workflowIds → workflow_id IN (...)", () => {
    const { sql, params } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      workflowIds: ["artwork-batch"],
    })
    expect(sql).toContain("workflow_id IN (?)")
    expect(params[0]).toBe("artwork-batch")
  })

  it("batchId → batch_id = ? (singular)", () => {
    const { sql, params } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      batchId: "batch_abc",
    })
    expect(sql).toContain("batch_id = ?")
    expect(params[0]).toBe("batch_abc")
  })

  it("providerIds + modelIds compose with AND", () => {
    const { sql } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      providerIds: ["gemini", "vertex"],
      modelIds: ["imagen-4.0-generate-001"],
    })
    expect(sql).toContain("provider_id IN (?, ?)")
    expect(sql).toContain("model_id IN (?)")
    expect(sql).toContain("provider_id IN (?, ?) AND model_id IN (?)")
  })

  it("replayClasses → replay_class IN (...)", () => {
    const { sql, params } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      replayClasses: ["deterministic", "best_effort"],
    })
    expect(sql).toContain("replay_class IN (?, ?)")
    expect(params.slice(0, 2)).toEqual(["deterministic", "best_effort"])
  })

  // Session #29 Q-29.E — `[]` signals "0 of 3 checkboxes selected" → match none.
  it("replayClasses === [] → 1 = 0 clause (match none)", () => {
    const { sql, params } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      replayClasses: [],
    })
    expect(sql).toContain("1 = 0")
    expect(sql).not.toContain("replay_class IN")
    // Only limit + offset should be in params — no replay-class values leaked.
    expect(params).toEqual([50, 0])
  })

  it("replayClasses === [] composes into WHERE chain alongside other filters", () => {
    const { sql } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      profileIds: ["chartlens"],
      replayClasses: [],
    })
    expect(sql).toMatch(/WHERE profile_id IN \(\?\) AND 1 = 0/)
  })

  it("replayClasses === undefined → no clause (parity with empty filter)", () => {
    const { sql } = buildAssetListQuery(emptyAssetListFilter())
    expect(sql).not.toContain("replay_class")
    expect(sql).not.toContain("1 = 0")
  })
})

describe("buildAssetListQuery — tag semantics", () => {
  it("tags OR mode → joined with OR", () => {
    const { sql, params } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      tags: ["sunset", "neon"],
      tagMatchMode: "any",
    })
    expect(sql).toContain("(tags LIKE ? OR tags LIKE ?)")
    expect(params).toContain('%"sunset"%')
    expect(params).toContain('%"neon"%')
  })

  it("tags AND mode → joined with AND", () => {
    const { sql } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      tags: ["retro", "pastel"],
      tagMatchMode: "all",
    })
    expect(sql).toContain("(tags LIKE ? AND tags LIKE ?)")
  })

  it("default tagMatchMode is 'any' when unset with tags present", () => {
    const { sql } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      tags: ["a", "b"],
    })
    expect(sql).toContain("OR tags LIKE ?")
  })

  it("escapes embedded double-quotes + backslashes in tag values", () => {
    const { params } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      tags: ['foo"bar', "back\\slash"],
    })
    expect(params).toContain('%"foo\\"bar"%')
    expect(params).toContain('%"back\\\\slash"%')
  })

  it("empty tag array is ignored (no clause, no params)", () => {
    const { sql } = buildAssetListQuery({ ...emptyAssetListFilter(), tags: [] })
    expect(sql).not.toContain("LIKE")
  })
})

describe("buildAssetListQuery — date preset", () => {
  it("'all' → no created_at clause", () => {
    const { sql } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      datePreset: "all",
    })
    expect(sql).not.toContain("created_at >=")
  })

  it("'today' → midnight local ISO boundary", () => {
    const nowIso = "2026-04-24T15:30:00.000Z"
    const { params } = buildAssetListQuery(
      { ...emptyAssetListFilter(), datePreset: "today" },
      { nowIso },
    )
    const boundary = params[params.length - 3]
    expect(typeof boundary).toBe("string")
    expect(boundary as string).toMatch(/^2026-04-2\d/)
  })

  it("'7d' → 7 days before nowIso", () => {
    const nowIso = "2026-04-24T12:00:00.000Z"
    const { params } = buildAssetListQuery(
      { ...emptyAssetListFilter(), datePreset: "7d" },
      { nowIso },
    )
    const boundary = params[params.length - 3] as string
    expect(boundary).toBe("2026-04-17T12:00:00.000Z")
  })

  it("'30d' → 30 days before nowIso", () => {
    const nowIso = "2026-04-30T12:00:00.000Z"
    const { params } = buildAssetListQuery(
      { ...emptyAssetListFilter(), datePreset: "30d" },
      { nowIso },
    )
    const boundary = params[params.length - 3] as string
    expect(boundary).toBe("2026-03-31T12:00:00.000Z")
  })

  it("datePresetBoundary helper matches", () => {
    expect(datePresetBoundary("all")).toBeNull()
    expect(datePresetBoundary("7d", "2026-04-24T00:00:00.000Z")).toBe("2026-04-17T00:00:00.000Z")
  })
})

describe("buildAssetListQuery — pagination + composition", () => {
  it("appends limit + offset as the last two params", () => {
    const { params } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      profileIds: ["x"],
      limit: 20,
      offset: 40,
    })
    expect(params.slice(-2)).toEqual([20, 40])
  })

  it("defaults offset to 0 when undefined", () => {
    const { params } = buildAssetListQuery({ ...emptyAssetListFilter(), limit: 10 })
    expect(params.slice(-2)).toEqual([10, 0])
  })

  it("combines every dimension into a single WHERE ... AND chain", () => {
    const { sql } = buildAssetListQuery({
      ...emptyAssetListFilter(),
      profileIds: ["p1"],
      workflowIds: ["artwork-batch"],
      batchId: "b1",
      providerIds: ["gemini"],
      modelIds: ["m1"],
      replayClasses: ["deterministic"],
      tags: ["sunset"],
      tagMatchMode: "any",
      datePreset: "7d",
      limit: 10,
    })
    expect(sql).toMatch(/WHERE .+ AND .+ AND .+ AND .+ AND .+ AND .+ AND .+ AND /)
  })
})
