// Session #32 F4 — SQL shape guards for the /api/tags builder.
//
// The integration suite exercises real SQLite + json_each; these unit tests
// lock the builder's output shape so a silent SQL-string regression would fail
// fast without needing to boot a DB.

import { describe, expect, it } from "vitest"

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
