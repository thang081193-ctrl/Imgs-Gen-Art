// Session #37 Phase A1 (PLAN-v3 §6) — saved_styles CRUD.
//
// Mirrors the prompt-history-repo factory shape: pure DB module, no boot
// I/O, returns a frozen-API object the context singleton wires up. DTO
// mapping pre-resolves `previewAssetUrl` from `preview_asset_id` so route
// callers don't stitch URLs themselves (Rule 11).
//
// `lanes_json` is parsed defensively — a corrupted blob falls back to []
// rather than throwing, so a single bad row doesn't 500 the list endpoint.

import type Database from "better-sqlite3"
import type {
  SavedStyleDto,
  SavedStyleKind,
  SavedStyleLaneTag,
} from "@/core/dto/saved-style-dto"

export interface SavedStyleInsertInput {
  id: string
  slug: string
  name: string
  description?: string | null
  kind: SavedStyleKind
  promptTemplate: string
  previewAssetId?: string | null
  lanes: SavedStyleLaneTag[]
  createdAt: string
  updatedAt: string
}

export interface SavedStyleUpdatePatch {
  name?: string
  description?: string | null
  promptTemplate?: string
  previewAssetId?: string | null
  lanes?: SavedStyleLaneTag[]
}

export interface SavedStyleListFilter {
  lane?: string
  kind?: SavedStyleKind
}

interface SavedStyleRow {
  id: string
  slug: string
  name: string
  description: string | null
  kind: string
  prompt_template: string
  preview_asset_id: string | null
  lanes_json: string
  usage_count: number
  created_at: string
  updated_at: string
}

function parseLanes(raw: string): SavedStyleLaneTag[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed as SavedStyleLaneTag[]
    }
  } catch {
    // fall through
  }
  return []
}

function rowToDto(row: SavedStyleRow): SavedStyleDto {
  const previewAssetId = row.preview_asset_id
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind as SavedStyleKind,
    promptTemplate: row.prompt_template,
    previewAssetId,
    previewAssetUrl: previewAssetId ? `/api/assets/${previewAssetId}/file` : null,
    lanes: parseLanes(row.lanes_json),
    usageCount: row.usage_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function laneMatches(stored: SavedStyleLaneTag[], filter: string): boolean {
  // Filter "ads" matches "ads.meta" + "ads.google-ads"; exact lane tag
  // ("ads.meta") matches itself. Prefix-with-dot to avoid "ads" matching
  // a hypothetical "adsense" lane in the future.
  if (stored.includes(filter as SavedStyleLaneTag)) return true
  return stored.some((tag) => tag.startsWith(`${filter}.`))
}

export function createSavedStylesRepo(db: Database.Database) {
  const insertStmt = db.prepare(
    `INSERT INTO saved_styles (
       id, slug, name, description, kind, prompt_template,
       preview_asset_id, lanes_json, usage_count, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
  const findByIdStmt = db.prepare(`SELECT * FROM saved_styles WHERE id = ?`)
  const findBySlugStmt = db.prepare(`SELECT * FROM saved_styles WHERE slug = ?`)
  const listAllStmt = db.prepare(
    `SELECT * FROM saved_styles ORDER BY created_at DESC`,
  )
  const listByKindStmt = db.prepare(
    `SELECT * FROM saved_styles WHERE kind = ? ORDER BY created_at DESC`,
  )
  const deleteStmt = db.prepare(`DELETE FROM saved_styles WHERE id = ?`)

  return {
    insert(input: SavedStyleInsertInput): SavedStyleDto {
      insertStmt.run(
        input.id,
        input.slug,
        input.name,
        input.description ?? null,
        input.kind,
        input.promptTemplate,
        input.previewAssetId ?? null,
        JSON.stringify(input.lanes),
        input.createdAt,
        input.updatedAt,
      )
      const row = findByIdStmt.get(input.id) as SavedStyleRow
      return rowToDto(row)
    },

    findById(id: string): SavedStyleDto | null {
      const row = findByIdStmt.get(id) as SavedStyleRow | undefined
      return row ? rowToDto(row) : null
    },

    findBySlug(slug: string): SavedStyleDto | null {
      const row = findBySlugStmt.get(slug) as SavedStyleRow | undefined
      return row ? rowToDto(row) : null
    },

    list(filter: SavedStyleListFilter = {}): SavedStyleDto[] {
      const rows = (
        filter.kind ? listByKindStmt.all(filter.kind) : listAllStmt.all()
      ) as SavedStyleRow[]
      const dtos = rows.map(rowToDto)
      return filter.lane ? dtos.filter((d) => laneMatches(d.lanes, filter.lane!)) : dtos
    },

    update(id: string, patch: SavedStyleUpdatePatch): SavedStyleDto {
      const sets: string[] = []
      const values: unknown[] = []
      if (patch.name !== undefined) {
        sets.push("name = ?")
        values.push(patch.name)
      }
      if (Object.prototype.hasOwnProperty.call(patch, "description")) {
        sets.push("description = ?")
        values.push(patch.description ?? null)
      }
      if (patch.promptTemplate !== undefined) {
        sets.push("prompt_template = ?")
        values.push(patch.promptTemplate)
      }
      if (Object.prototype.hasOwnProperty.call(patch, "previewAssetId")) {
        sets.push("preview_asset_id = ?")
        values.push(patch.previewAssetId ?? null)
      }
      if (patch.lanes !== undefined) {
        sets.push("lanes_json = ?")
        values.push(JSON.stringify(patch.lanes))
      }
      sets.push("updated_at = ?")
      values.push(new Date().toISOString())
      const sql = `UPDATE saved_styles SET ${sets.join(", ")} WHERE id = ?`
      const result = db.prepare(sql).run(...values, id)
      if (result.changes === 0) {
        throw new Error(`saved-styles-repo.update: unknown id '${id}'`)
      }
      const row = findByIdStmt.get(id) as SavedStyleRow
      return rowToDto(row)
    },

    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0
    },
  }
}

export type SavedStylesRepo = ReturnType<typeof createSavedStylesRepo>
