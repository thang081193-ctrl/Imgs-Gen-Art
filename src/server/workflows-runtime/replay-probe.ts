// Session #27a carry-forward #6 from Session #26 — extracted from
// replay-service.ts to keep that file under CONTRIBUTING Rule 7's 300 LOC
// hard cap once the dual-reader (canonical + legacy) + mode=edit wiring
// landed. Probe semantics unchanged from Session #26.
//
// Lightweight precondition probe for the /replay-class UI button state.
// Does NOT throw on `not_replayable`: that's an expected, displayable state —
// the disabled-button-with-tooltip UX needs to distinguish which of the 3
// reasons applies. Other preconditions still hard-fail (404 if the asset row
// is missing — there's nothing to probe).

import type { NotReplayableReason } from "@/core/dto/asset-dto"
import { getModel } from "@/core/model-registry/models"
import { NotFoundError } from "@/core/shared/errors"
import { computeNotReplayableReason } from "@/core/shared/replay-class"
import { getAssetRepo as getAssetRepoDefault } from "@/server/asset-store"

import { loadReplayContext, type ReplayServiceDeps } from "./replay-service"

export type ReplayProbeResult =
  | {
      kind: "replayable"
      replayClass: "deterministic" | "best_effort"
      providerId: string
      modelId: string
      estimatedCostUsd: number
      workflowId: string
    }
  | {
      kind: "not_replayable"
      reason: NotReplayableReason
      providerId: string
      modelId: string
      workflowId: string
    }

export function probeReplayClass(
  assetId: string,
  deps: Pick<ReplayServiceDeps, "assetRepo" | "resolveModel" | "hasActiveKey"> = {},
): ReplayProbeResult {
  const assetRepo = deps.assetRepo ?? getAssetRepoDefault()
  const resolveModel = deps.resolveModel ?? getModel

  const sourceAsset = assetRepo.findById(assetId)
  if (!sourceAsset) {
    throw new NotFoundError(`Asset '${assetId}' not found`, { assetId })
  }

  if (sourceAsset.replayClass === "not_replayable") {
    // Model lookup is best-effort here — if the stored model has been dropped
    // from the registry we still want to surface *some* reason (the helper
    // treats undefined capability as `provider_no_seed_support`).
    const model = resolveModel(sourceAsset.modelId)
    const reason = computeNotReplayableReason({
      seed: sourceAsset.seed,
      capability: model?.capability,
    })
    return {
      kind: "not_replayable",
      reason,
      providerId: sourceAsset.providerId,
      modelId: sourceAsset.modelId,
      workflowId: sourceAsset.workflowId,
    }
  }

  const ctx = loadReplayContext(assetId, deps)
  return {
    kind: "replayable",
    replayClass: ctx.sourceAsset.replayClass as "deterministic" | "best_effort",
    providerId: ctx.execute.providerId,
    modelId: ctx.execute.modelId,
    estimatedCostUsd: ctx.model.costPerImageUsd,
    workflowId: ctx.sourceAsset.workflowId,
  }
}
