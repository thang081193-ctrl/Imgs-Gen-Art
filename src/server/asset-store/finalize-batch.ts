// Phase 4 Step 5 (Session #21) — shared batch-finalization helper.
//
// All 4 workflows need the same end-of-run accounting: aggregate successful
// asset count + total cost from the per-asset `cost_usd` column, then call
// batchRepo.updateStatus with the terminal status ("completed" | "aborted" |
// "error"). Centralizing here:
//   - Single source of truth for the cost aggregation query.
//   - DRY across the 4 workflow run() implementations.
//   - Asset-level cost_usd is the ledger; batch total is derived.
//
// Fires 3x per workflow: normal complete, aborted (cancel), error.
//
// Phase C3 (Session #43): optional `policyDecision` — when supplied the
// audit blob is written to `batches.policy_decision_json` BEFORE
// `updateStatus` so the row never appears terminal without its decision.
// All existing callers pass `undefined` → no behavior change (Q-43.G
// LOCKED: workflow runner is the call-site that supplies the decision,
// wired in S#44+).

import type { PolicyDecision } from "@/core/schemas/policy-decision"
import type { AssetRepo } from "./asset-repo"
import type { BatchRepo, BatchTerminalStatus } from "./batch-repo"

export interface FinalizeBatchArgs {
  batchId: string
  status: BatchTerminalStatus
  assetRepo: AssetRepo
  batchRepo: BatchRepo
  /** ISO timestamp for completedAt/abortedAt. */
  at: string
  /** Phase C3: optional audit blob; `undefined` skips the write. */
  policyDecision?: PolicyDecision
}

export interface FinalizeBatchResult {
  totalAssets: number
  successfulAssets: number
  totalCostUsd: number
}

export function finalizeBatch(args: FinalizeBatchArgs): FinalizeBatchResult {
  const assets = args.assetRepo.findByBatch(args.batchId)
  const successful = assets.filter((a) => a.status === "completed")
  const successfulAssets = successful.length
  const totalCostUsd = successful.reduce((sum, a) => sum + (a.costUsd ?? 0), 0)

  if (args.policyDecision !== undefined) {
    args.batchRepo.updatePolicyDecision(args.batchId, args.policyDecision)
  }

  const update: Parameters<BatchRepo["updateStatus"]>[1] = {
    status: args.status,
    successfulAssets,
    totalCostUsd,
  }
  if (args.status === "completed") update.completedAt = args.at
  if (args.status === "aborted") update.abortedAt = args.at

  args.batchRepo.updateStatus(args.batchId, update)

  return {
    totalAssets: assets.length,
    successfulAssets,
    totalCostUsd,
  }
}
