// Batch repository — Phase 1 stub: create + findById.
// Full batch lifecycle (update status, record completion/abort) arrives in
// Phase 3 when the workflow dispatcher emits batch events.

import type Database from "better-sqlite3"
import type {
  BatchCreateInput,
  BatchInternal,
  BatchStatus,
} from "./types"

interface BatchRow {
  id: string
  profile_id: string
  workflow_id: string
  total_assets: number
  successful_assets: number
  total_cost_usd: number | null
  status: string
  started_at: string
  completed_at: string | null
  aborted_at: string | null
}

function rowToBatch(row: BatchRow): BatchInternal {
  return {
    id: row.id,
    profileId: row.profile_id,
    workflowId: row.workflow_id,
    totalAssets: row.total_assets,
    successfulAssets: row.successful_assets,
    totalCostUsd: row.total_cost_usd,
    status: row.status as BatchStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    abortedAt: row.aborted_at,
  }
}

export function createBatchRepo(db: Database.Database) {
  const insertStmt = db.prepare(
    `INSERT INTO batches (
      id, profile_id, workflow_id,
      total_assets, successful_assets, total_cost_usd,
      status, started_at, completed_at, aborted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
  )
  const findByIdStmt = db.prepare(`SELECT * FROM batches WHERE id = ?`)

  return {
    create(input: BatchCreateInput): BatchInternal {
      const now = new Date().toISOString()
      insertStmt.run(
        input.id,
        input.profileId,
        input.workflowId,
        input.totalAssets,
        input.successfulAssets ?? 0,
        input.totalCostUsd ?? null,
        input.status,
        input.startedAt ?? now,
      )
      const row = findByIdStmt.get(input.id) as BatchRow
      return rowToBatch(row)
    },

    findById(id: string): BatchInternal | null {
      const row = findByIdStmt.get(id) as BatchRow | undefined
      return row ? rowToBatch(row) : null
    },
  }
}

export type BatchRepo = ReturnType<typeof createBatchRepo>
