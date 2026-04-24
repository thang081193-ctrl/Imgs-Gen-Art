// Session #32 F4 — SQL shape guards for the /api/tags builder + client path
// builder (F4-FE). Unit scope so neither DB nor React runtime is required.
//
// The integration suite exercises real SQLite + json_each for the SQL side;
// Preview MCP covers the combobox UX. These tests cover the two pure pieces.

import { describe, expect, it } from "vitest"

import { buildAssetTagsPath } from "@/client/api/hooks"
import {
  buildTagsCountQuery,
  buildTagsQuery,
} from "@/server/asset-store/tags-query"

describe("buildTagsQuery", () => {
  it("returns SQL that unnests via json_each + COALESCE on NULL, with prefix LIKE + NOCASE + ORDER + LIMIT", () => {
    const q = buildTagsQuery({ q: "foo", limit: 10 })
    expect(q.sql).toContain("json_each(COALESCE(assets.tags, '[]'))")
    expect(q.sql).toContain("LIKE ? || '%'")
    expect(q.sql).toContain("COLLATE NOCASE")
    expect(q.sql).toContain("GROUP BY json_each.value")
    expect(q.sql).toContain("ORDER BY count DESC, tag ASC")
    expect(q.sql).toContain("LIMIT ?")
    expect(q.params).toEqual(["foo", 10])
  })

  it("passes empty q through as-is (LIKE ''||'%' matches everything)", () => {
    const q = buildTagsQuery({ q: "", limit: 5 })
    expect(q.params).toEqual(["", 5])
  })
})

describe("buildTagsCountQuery", () => {
  it("returns DISTINCT COUNT SQL with single q param", () => {
    const q = buildTagsCountQuery({ q: "foo" })
    expect(q.sql).toContain("COUNT(DISTINCT json_each.value)")
    expect(q.sql).toContain("json_each(COALESCE(assets.tags, '[]'))")
    expect(q.sql).toContain("COLLATE NOCASE")
    expect(q.params).toEqual(["foo"])
  })
})

// Session #32 F4-FE — client-side URL builder for the autocomplete hook.
describe("buildAssetTagsPath (F4-FE)", () => {
  it("returns null when q is null (skips the fetch)", () => {
    expect(buildAssetTagsPath(null, 10)).toBeNull()
  })

  it("omits q param when q is empty string (top-N request)", () => {
    expect(buildAssetTagsPath("", 10)).toBe("/api/tags?limit=10")
  })

  it("URL-encodes the q prefix", () => {
    expect(buildAssetTagsPath("space here", 5)).toBe("/api/tags?q=space+here&limit=5")
  })

  it("always appends limit", () => {
    expect(buildAssetTagsPath("foo", 20)).toBe("/api/tags?q=foo&limit=20")
  })
})
