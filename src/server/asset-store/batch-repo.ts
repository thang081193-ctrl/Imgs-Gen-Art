// Batch repository — Phase 3: create + findById + updateStatus.
// Lifecycle: caller stamps `startedAt` in `create()`, then calls
// `updateStatus()` at batch end with the terminal status + stamp. Repo
// does NOT auto-stamp timestamps — caller (workflow run.ts) holds the
// wall-clock authority so tests can pin it deterministically.

import type Database from "better-sqlite3"
import { asWorkflowId } from "@/core/design/types"
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
    workflowId: asWorkflowId(row.workflow_id),
    totalAssets: row.total_assets,
    successfulAssets: row.successful_assets,
    totalCostUsd: row.total_cost_usd,
    status: row.status as BatchStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    abortedAt: row.aborted_at,
  }
}

export type BatchTerminalStatus = "completed" | "aborted" | "error"

export interface BatchUpdatePatch {
  status: BatchTerminalStatus
  successfulAssets?: number
  totalCostUsd?: number | null
  completedAt?: string
  abortedAt?: string
}

function assertValidPatch(patch: BatchUpdatePatch): void {
  if (patch.status === "completed" && !patch.completedAt) {
    throw new Error("batch-repo.updateStatus: completedAt required when status='completed'")
  }
  if (patch.status === "aborted" && !patch.abortedAt) {
    throw new Error("batch-repo.updateStatus: abortedAt required when status='aborted'")
  }
  // status='error': neither timestamp required (permanent failure, caller
  // may stamp completedAt at its discretion for surfacing in UI).
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
  const updateStatusStmt = db.prepare(
    `UPDATE batches
     SET status = ?,
         successful_assets = COALESCE(?, successful_assets),
         total_cost_usd = COALESCE(?, total_cost_usd),
         completed_at = COALESCE(?, completed_at),
         aborted_at = COALESCE(?, aborted_at)
     WHERE id = ?`,
  )

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

    /**
     * Terminal-status transition. Valid moves:
     *   running → completed (requires completedAt)
     *   running → aborted   (requires abortedAt)
     *   running → error     (timestamps optional)
     * Throws if id unknown. No-op guard on status not enforced here —
     * caller should not re-transition a terminal batch.
     */
    updateStatus(batchId: string, patch: BatchUpdatePatch): BatchInternal {
      assertValidPatch(patch)
      const result = updateStatusStmt.run(
        patch.status,
        patch.successfulAssets ?? null,
        patch.totalCostUsd ?? null,
        patch.completedAt ?? null,
        patch.abortedAt ?? null,
        batchId,
      )
      if (result.changes === 0) {
        throw new Error(`batch-repo.updateStatus: unknown batch id '${batchId}'`)
      }
      const row = findByIdStmt.get(batchId) as BatchRow
      return rowToBatch(row)
    },
  }
}

export type BatchRepo = ReturnType<typeof createBatchRepo>
