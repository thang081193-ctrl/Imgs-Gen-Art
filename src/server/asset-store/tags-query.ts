// Session #32 F4 — SQL builders for GET /api/tags autocomplete.
//
// v1 reads the JSON `tags` column on assets (stored as a JSON array string,
// NULL when absent) and unnests via json_each. COALESCE(tags, '[]') coerces
// NULL rows into zero json_each output rows (json_each(NULL) errors otherwise).
//
// Case-insensitive prefix match via LIKE ... COLLATE NOCASE. No LIKE escape —
// matches v1 filter-layer choice (DECISIONS §C1) that accepts % / _ wildcard
// bleed from user-typed tags as acceptable risk until real usage surfaces it.
//
// §C1 asset_tags JOIN trigger still not tripped; shape here is intentionally
// flat (`{ tag, count }`) so F4 response can grow `{id, color, createdAt, ...}`
// additively when the tags table migration eventually lands.

export interface BuiltTagsQuery {
  sql: string
  params: unknown[]
}

export function buildTagsQuery(opts: { q: string; limit: number }): BuiltTagsQuery {
  return {
    sql: `SELECT json_each.value AS tag, COUNT(*) AS count
          FROM assets, json_each(COALESCE(assets.tags, '[]'))
          WHERE json_each.value LIKE ? || '%' COLLATE NOCASE
          GROUP BY json_each.value
          ORDER BY count DESC, tag ASC
          LIMIT ?`,
    params: [opts.q, opts.limit],
  }
}

export function buildTagsCountQuery(opts: { q: string }): BuiltTagsQuery {
  return {
    sql: `SELECT COUNT(DISTINCT json_each.value) AS total
          FROM assets, json_each(COALESCE(assets.tags, '[]'))
          WHERE json_each.value LIKE ? || '%' COLLATE NOCASE`,
    params: [opts.q],
  }
}
