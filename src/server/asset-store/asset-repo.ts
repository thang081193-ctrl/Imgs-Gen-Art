// Asset repository — Phase 1 stub: insert + findById + findByBatch + list.
// Full CRUD + query surface arrives in Phase 3 alongside workflow runners.
// `list` is stubbed early because Phase 3 DTO-no-paths audit test needs it.

import type Database from "better-sqlite3"
import { asWorkflowId } from "@/core/design/types"
import type {
  AssetInternal,
  AssetInsertInput,
  AssetListFilter,
} from "./types"
import { buildAssetListQuery } from "./asset-list-query"
import { buildTagsCountQuery, buildTagsQuery } from "./tags-query"

const COLUMNS = [
  "id",
  "profile_id",
  "profile_version_at_gen",
  "workflow_id",
  "batch_id",
  "variant_group",
  "prompt_raw",
  "prompt_template_id",
  "prompt_template_version",
  "input_params",
  "replay_payload",
  "replay_class",
  "provider_id",
  "model_id",
  "seed",
  "aspect_ratio",
  "language",
  "file_path",
  "width",
  "height",
  "file_size_bytes",
  "status",
  "error_message",
  "generation_time_ms",
  "cost_usd",
  "tags",
  "notes",
  "replayed_from",
  "created_at",
] as const

interface AssetRow {
  id: string
  profile_id: string
  profile_version_at_gen: number
  workflow_id: string
  batch_id: string | null
  variant_group: string | null
  prompt_raw: string
  prompt_template_id: string | null
  prompt_template_version: string | null
  input_params: string
  replay_payload: string | null
  replay_class: string
  provider_id: string
  model_id: string
  seed: number | null
  aspect_ratio: string
  language: string | null
  file_path: string
  width: number | null
  height: number | null
  file_size_bytes: number | null
  status: string
  error_message: string | null
  generation_time_ms: number | null
  cost_usd: number | null
  tags: string | null
  notes: string | null
  replayed_from: string | null
  created_at: string
}

function rowToAsset(row: AssetRow): AssetInternal {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileVersionAtGen: row.profile_version_at_gen,
    workflowId: asWorkflowId(row.workflow_id),
    batchId: row.batch_id,
    variantGroup: row.variant_group,
    promptRaw: row.prompt_raw,
    promptTemplateId: row.prompt_template_id,
    promptTemplateVersion: row.prompt_template_version,
    inputParams: row.input_params,
    replayPayload: row.replay_payload,
    replayClass: row.replay_class as AssetInternal["replayClass"],
    providerId: row.provider_id,
    modelId: row.model_id,
    seed: row.seed,
    aspectRatio: row.aspect_ratio as AssetInternal["aspectRatio"],
    language: row.language as AssetInternal["language"],
    filePath: row.file_path,
    width: row.width,
    height: row.height,
    fileSizeBytes: row.file_size_bytes,
    status: row.status as AssetInternal["status"],
    errorMessage: row.error_message,
    generationTimeMs: row.generation_time_ms,
    costUsd: row.cost_usd,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
    notes: row.notes,
    replayedFrom: row.replayed_from,
    createdAt: row.created_at,
  }
}

export function createAssetRepo(db: Database.Database) {
  const placeholders = COLUMNS.map(() => "?").join(", ")
  const insertStmt = db.prepare(
    `INSERT INTO assets (${COLUMNS.join(", ")}) VALUES (${placeholders})`,
  )
  const findByIdStmt = db.prepare(`SELECT * FROM assets WHERE id = ?`)
  const findByBatchStmt = db.prepare(
    `SELECT * FROM assets WHERE batch_id = ? ORDER BY created_at ASC`,
  )
  const countByProfileStmt = db.prepare(
    `SELECT COUNT(*) AS count FROM assets WHERE profile_id = ?`,
  )
  const deleteByIdStmt = db.prepare(`DELETE FROM assets WHERE id = ?`)

  return {
    insert(input: AssetInsertInput): AssetInternal {
      const now = new Date().toISOString()
      insertStmt.run(
        input.id,
        input.profileId,
        input.profileVersionAtGen,
        input.workflowId,
        input.batchId ?? null,
        input.variantGroup ?? null,
        input.promptRaw,
        input.promptTemplateId ?? null,
        input.promptTemplateVersion ?? null,
        input.inputParams,
        input.replayPayload ?? null,
        input.replayClass,
        input.providerId,
        input.modelId,
        input.seed ?? null,
        input.aspectRatio,
        input.language ?? null,
        input.filePath,
        input.width ?? null,
        input.height ?? null,
        input.fileSizeBytes ?? null,
        input.status,
        input.errorMessage ?? null,
        input.generationTimeMs ?? null,
        input.costUsd ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.notes ?? null,
        input.replayedFrom ?? null,
        input.createdAt ?? now,
      )
      const row = findByIdStmt.get(input.id) as AssetRow
      return rowToAsset(row)
    },

    findById(id: string): AssetInternal | null {
      const row = findByIdStmt.get(id) as AssetRow | undefined
      return row ? rowToAsset(row) : null
    },

    findByBatch(batchId: string): AssetInternal[] {
      return (findByBatchStmt.all(batchId) as AssetRow[]).map(rowToAsset)
    },

    countByProfile(profileId: string): number {
      const row = countByProfileStmt.get(profileId) as { count: number }
      return row.count
    },

    deleteById(id: string): boolean {
      return deleteByIdStmt.run(id).changes > 0
    },

    list(filter: AssetListFilter): AssetInternal[] {
      const { sql, params } = buildAssetListQuery(filter)
      const rows = db.prepare(sql).all(...params) as AssetRow[]
      return rows.map(rowToAsset)
    },

    listTags(opts: { q: string; limit: number }): {
      tags: { tag: string; count: number }[]
      total: number
    } {
      const tagsQ = buildTagsQuery(opts)
      const tags = db.prepare(tagsQ.sql).all(...tagsQ.params) as {
        tag: string
        count: number
      }[]
      const totalQ = buildTagsCountQuery({ q: opts.q })
      const totalRow = db.prepare(totalQ.sql).get(...totalQ.params) as {
        total: number
      }
      return { tags, total: totalRow.total }
    },
  }
}

export type AssetRepo = ReturnType<typeof createAssetRepo>
