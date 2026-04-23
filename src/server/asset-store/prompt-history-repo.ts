// Phase 5 Step 5b (Session #27b) — prompt_history CRUD.
//
// Writes: insert on edit-replay start (status=pending), updateStatus on
// complete/failed/cancelled. Reads: listByAsset for the PromptLab sidebar.
// Repo API is deliberately narrow — no generic findAll / no search — to
// keep it easy to reason about; v1.1 can grow `?profileId=` etc. when the
// cross-asset history browser ships.

import type Database from "better-sqlite3"
import type {
  PromptHistoryDto,
  PromptHistoryOverrideParams,
  PromptHistoryStatus,
} from "@/core/dto/prompt-history-dto"

export interface PromptHistoryInsertInput {
  id: string
  assetId: string
  profileId: string
  promptRaw: string
  overrideParams: PromptHistoryOverrideParams
  createdAt: string
  parentHistoryId?: string | null
  createdBySession?: string | null
}

export interface PromptHistoryUpdatePatch {
  status: PromptHistoryStatus
  resultAssetId?: string | null
  costUsd?: number | null
  errorMessage?: string | null
}

interface PromptHistoryRow {
  id: string
  asset_id: string | null
  result_asset_id: string | null
  parent_history_id: string | null
  profile_id: string
  prompt_raw: string
  override_params: string
  created_at: string
  status: string
  cost_usd: number | null
  error_message: string | null
}

function parseOverrideParams(raw: string): PromptHistoryOverrideParams {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rec = parsed as Record<string, unknown>
      const out: PromptHistoryOverrideParams = {}
      if (typeof rec.addWatermark === "boolean") out.addWatermark = rec.addWatermark
      if (typeof rec.negativePrompt === "string") out.negativePrompt = rec.negativePrompt
      return out
    }
  } catch {
    // fall through
  }
  return {}
}

function rowToDto(row: PromptHistoryRow): PromptHistoryDto {
  return {
    id: row.id,
    assetId: row.asset_id,
    resultAssetId: row.result_asset_id,
    parentHistoryId: row.parent_history_id,
    profileId: row.profile_id,
    promptRaw: row.prompt_raw,
    overrideParams: parseOverrideParams(row.override_params),
    createdAt: row.created_at,
    status: row.status as PromptHistoryStatus,
    costUsd: row.cost_usd,
    errorMessage: row.error_message,
  }
}

export function createPromptHistoryRepo(db: Database.Database) {
  const insertStmt = db.prepare(
    `INSERT INTO prompt_history (
       id, asset_id, result_asset_id, parent_history_id,
       profile_id, prompt_raw, override_params, created_at,
       created_by_session, status, cost_usd, error_message
     ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL)`,
  )
  const findByIdStmt = db.prepare(`SELECT * FROM prompt_history WHERE id = ?`)
  const listByAssetStmt = db.prepare(
    `SELECT * FROM prompt_history WHERE asset_id = ? ORDER BY created_at DESC`,
  )
  const updateStatusStmt = db.prepare(
    `UPDATE prompt_history
       SET status = ?,
           result_asset_id = COALESCE(?, result_asset_id),
           cost_usd = COALESCE(?, cost_usd),
           error_message = COALESCE(?, error_message)
     WHERE id = ?`,
  )

  return {
    insert(input: PromptHistoryInsertInput): PromptHistoryDto {
      insertStmt.run(
        input.id,
        input.assetId,
        input.parentHistoryId ?? null,
        input.profileId,
        input.promptRaw,
        JSON.stringify(input.overrideParams),
        input.createdAt,
        input.createdBySession ?? null,
      )
      const row = findByIdStmt.get(input.id) as PromptHistoryRow
      return rowToDto(row)
    },

    findById(id: string): PromptHistoryDto | null {
      const row = findByIdStmt.get(id) as PromptHistoryRow | undefined
      return row ? rowToDto(row) : null
    },

    listByAsset(assetId: string): PromptHistoryDto[] {
      const rows = listByAssetStmt.all(assetId) as PromptHistoryRow[]
      return rows.map(rowToDto)
    },

    updateStatus(id: string, patch: PromptHistoryUpdatePatch): PromptHistoryDto {
      const result = updateStatusStmt.run(
        patch.status,
        patch.resultAssetId ?? null,
        patch.costUsd ?? null,
        patch.errorMessage ?? null,
        id,
      )
      if (result.changes === 0) {
        throw new Error(`prompt-history-repo.updateStatus: unknown id '${id}'`)
      }
      const row = findByIdStmt.get(id) as PromptHistoryRow
      return rowToDto(row)
    },
  }
}

export type PromptHistoryRepo = ReturnType<typeof createPromptHistoryRepo>
