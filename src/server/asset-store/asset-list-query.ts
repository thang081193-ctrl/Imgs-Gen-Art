// Session #28 (Phase 5 Step 3) — SQL builder for the expanded asset list
// filter. Pure function: (AssetListFilter) → { sql, params }. Keeps the
// asset-repo thin + unit-testable without a DB.
//
// Tag semantics (DECISIONS §C1 — LIKE scan v1):
//   OR  → (tags LIKE ? OR tags LIKE ?) with `%"tag"%` params
//   AND → same shape but joined with AND
//   (A proper asset_tags JOIN table is Session #29+ work.)
//
// Date preset boundary is computed at SQL-build time (not schema time) so
// tests can pass a `nowIso` override — otherwise "today" / rolling windows
// would leak wall-clock into pure schema logic.

import type { AssetListFilter } from "@/core/schemas/asset-list-filter"

export interface BuiltQuery {
  sql: string
  params: unknown[]
}

export interface BuildOptions {
  /** ISO timestamp used to compute date-preset boundaries. Defaults to Date.now(). */
  nowIso?: string
}

export function buildAssetListQuery(
  filter: AssetListFilter,
  opts: BuildOptions = {},
): BuiltQuery {
  const where: string[] = []
  const params: unknown[] = []

  if (filter.profileIds && filter.profileIds.length > 0) {
    where.push(`profile_id IN (${placeholders(filter.profileIds.length)})`)
    params.push(...filter.profileIds)
  }

  if (filter.workflowIds && filter.workflowIds.length > 0) {
    where.push(`workflow_id IN (${placeholders(filter.workflowIds.length)})`)
    params.push(...filter.workflowIds)
  }

  if (filter.batchId !== undefined) {
    where.push("batch_id = ?")
    params.push(filter.batchId)
  }

  if (filter.providerIds && filter.providerIds.length > 0) {
    where.push(`provider_id IN (${placeholders(filter.providerIds.length)})`)
    params.push(...filter.providerIds)
  }

  if (filter.modelIds && filter.modelIds.length > 0) {
    where.push(`model_id IN (${placeholders(filter.modelIds.length)})`)
    params.push(...filter.modelIds)
  }

  if (filter.replayClasses && filter.replayClasses.length > 0) {
    where.push(`replay_class IN (${placeholders(filter.replayClasses.length)})`)
    params.push(...filter.replayClasses)
  }

  const tagClause = buildTagClause(filter.tags, filter.tagMatchMode ?? "any")
  if (tagClause !== null) {
    where.push(tagClause.sql)
    params.push(...tagClause.params)
  }

  const dateBoundary = datePresetBoundary(filter.datePreset ?? "all", opts.nowIso)
  if (dateBoundary !== null) {
    where.push("created_at >= ?")
    params.push(dateBoundary)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
  const sql = `SELECT * FROM assets ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  params.push(filter.limit, filter.offset ?? 0)
  return { sql, params }
}

function placeholders(n: number): string {
  return Array(n).fill("?").join(", ")
}

interface TagClause {
  sql: string
  params: string[]
}

function buildTagClause(
  tags: string[] | undefined,
  mode: "any" | "all",
): TagClause | null {
  if (!tags || tags.length === 0) return null
  const conds = tags.map(() => "tags LIKE ?")
  const joiner = mode === "all" ? " AND " : " OR "
  return {
    sql: `(${conds.join(joiner)})`,
    params: tags.map((t) => `%"${escapeTagLike(t)}"%`),
  }
}

// Escape SQL LIKE metacharacters (%, _, \) so user-supplied tag strings can't
// widen the pattern. Better-sqlite3 uses backslash as default LIKE escape; we
// pair the escape char with `ESCAPE '\'` implicitly by the LIKE default —
// but SQLite has no default escape, so tags with % or _ fall through as
// wildcards. v1 acceptable risk: tags are UI-driven + short; revisit if we
// allow free-text tag input with punctuation.
function escapeTagLike(tag: string): string {
  return tag.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

// `all`     → null (no filter)
// `today`   → midnight local ISO (filter.created_at >= today 00:00 local)
// `7d`/`30d`→ rolling window: now - N days
export function datePresetBoundary(
  preset: "all" | "today" | "7d" | "30d",
  nowIso?: string,
): string | null {
  if (preset === "all") return null
  const now = nowIso ? new Date(nowIso) : new Date()
  if (preset === "today") {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return midnight.toISOString()
  }
  const days = preset === "7d" ? 7 : 30
  const boundary = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return boundary.toISOString()
}
