// Phase 5 Step 1 (Session #25) — Replay service (generic, workflow-agnostic).
//
// Runs one `provider.generate()` call from a stored `assets.replay_payload`,
// writes a new asset linked to the source via `assets.replayed_from`,
// creates a new batch linked via `batches.replay_of_{batch,asset}_id`.
// Emits the standard WorkflowEvent stream (`started → image_generated →
// complete` / `error + complete` / `aborted`) so the /:id/replay route can
// wrap it in the existing streamSSE plumbing without reinventing framing.
//
// Scope deviation (per Session #25 chat decision): the 4 workflow runners
// are NOT modified. Replay is fundamentally workflow-agnostic because the
// stored payload holds the fully-resolved prompt; no concept/prompt-template
// re-run is needed. One service + one asset-writer helper handles all
// workflow families via source-asset metadata inheritance.
//
// Inference note: the simplified stored payload lacks providerSpecificParams.
// All 4 workflow asset-writers call provider.generate() with a hardcoded
// `{ addWatermark: false }` (see e.g. src/workflows/artwork-batch/run.ts:107),
// so replay inherits the same constant — matches original call semantics
// exactly until the canonical payload migration lands.

import { resolve } from "node:path"

import type { NotReplayableReason } from "@/core/dto/asset-dto"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import { getModel } from "@/core/model-registry/models"
import type { ModelInfo } from "@/core/model-registry/types"
import type { ImageProvider } from "@/core/providers/types"
import {
  BadRequestError,
  NoActiveKeyError,
  NotFoundError,
} from "@/core/shared/errors"
import { computeNotReplayableReason } from "@/core/shared/replay-class"
import {
  finalizeBatch,
  getAssetRepo as getAssetRepoDefault,
  getBatchRepo as getBatchRepoDefault,
  toAssetDto,
  type AssetInternal,
  type AssetRepo,
  type BatchRepo,
} from "@/server/asset-store"
import { loadStoredKeys } from "@/server/keys/store"
import { getProvider as getProviderDefault } from "@/server/providers"

import { writeReplayAsset } from "./replay-asset-writer"
import {
  StoredReplayPayloadSchema,
  type StoredReplayPayload,
} from "./replay-payload-shape"

export const DEFAULT_ASSETS_DIR = resolve(process.cwd(), "data", "assets")

export interface LoadedReplayContext {
  sourceAsset: AssetInternal
  model: ModelInfo
  payload: StoredReplayPayload
}

export interface ReplayServiceDeps {
  assetRepo?: AssetRepo
  batchRepo?: BatchRepo
  resolveModel?: (id: string) => ModelInfo | undefined
  resolveProvider?: (id: string) => ImageProvider
  hasActiveKey?: (providerId: string) => boolean
  assetsDir?: string
  now?: () => Date
}

function defaultHasActiveKey(providerId: string): boolean {
  if (providerId === "mock") return true
  const store = loadStoredKeys()
  if (providerId === "gemini") return store.gemini.activeSlotId !== null
  if (providerId === "vertex") return store.vertex.activeSlotId !== null
  return false
}

export function loadReplayContext(
  assetId: string,
  deps: Pick<ReplayServiceDeps, "assetRepo" | "resolveModel" | "hasActiveKey"> = {},
): LoadedReplayContext {
  const assetRepo = deps.assetRepo ?? getAssetRepoDefault()
  const resolveModel = deps.resolveModel ?? getModel
  const hasActiveKey = deps.hasActiveKey ?? defaultHasActiveKey

  const sourceAsset = assetRepo.findById(assetId)
  if (!sourceAsset) {
    throw new NotFoundError(`Asset '${assetId}' not found`, { assetId })
  }
  if (sourceAsset.replayClass === "not_replayable") {
    throw new BadRequestError(
      `Asset '${assetId}' is not replayable (watermark applied or seed missing)`,
      { assetId, replayClass: sourceAsset.replayClass },
    )
  }
  if (sourceAsset.replayPayload === null || sourceAsset.replayPayload.length === 0) {
    throw new BadRequestError(`Asset '${assetId}' has no replay payload stored`, {
      assetId,
    })
  }

  let raw: unknown
  try {
    raw = JSON.parse(sourceAsset.replayPayload)
  } catch {
    throw new BadRequestError(`Asset '${assetId}' replay payload is malformed JSON`, {
      assetId,
    })
  }
  const parsed = StoredReplayPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    throw new BadRequestError(`Asset '${assetId}' replay payload failed shape check`, {
      assetId,
      issues: parsed.error.issues,
    })
  }

  const model = resolveModel(parsed.data.modelId)
  if (!model || model.providerId !== parsed.data.providerId) {
    throw new BadRequestError(
      `Stored model '${parsed.data.modelId}' no longer registered for provider '${parsed.data.providerId}'`,
      { modelId: parsed.data.modelId, providerId: parsed.data.providerId },
    )
  }
  if (!hasActiveKey(parsed.data.providerId)) {
    throw new NoActiveKeyError(
      `No active key for provider '${parsed.data.providerId}' — rotate or add before replay`,
      { providerId: parsed.data.providerId },
    )
  }

  return { sourceAsset, model, payload: parsed.data }
}

// Session #26 (Phase 5 Step 2 fold-in) — lightweight probe for the UI button
// state. Does NOT throw on `not_replayable`: that's an expected, displayable
// state. The disabled-button-with-tooltip UX needs to distinguish which of
// the 3 reasons applies. Other preconditions still hard-fail (404 if the
// asset row is missing — there's nothing to probe).
//
// Compared to loadReplayContext used by POST /replay, this path skips:
//   - payload presence/shape validation (not needed to surface class + reason)
//   - active-key check for not_replayable (can't replay regardless — still
//     worth showing the reason to the user rather than a generic 401)
// For replayable classes (deterministic | best_effort) we DO run the full
// preconditions so 400/401 surface the same way as POST would.
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
    providerId: ctx.payload.providerId,
    modelId: ctx.payload.modelId,
    estimatedCostUsd: ctx.model.costPerImageUsd,
    workflowId: ctx.sourceAsset.workflowId,
  }
}

export interface ExecuteReplayParams {
  assetId: string
  newBatchId: string
  abortSignal: AbortSignal
}

export async function* executeReplay(
  params: ExecuteReplayParams,
  deps: ReplayServiceDeps = {},
): AsyncGenerator<WorkflowEvent> {
  const assetRepo = deps.assetRepo ?? getAssetRepoDefault()
  const batchRepo = deps.batchRepo ?? getBatchRepoDefault()
  const resolveProvider = deps.resolveProvider ?? getProviderDefault
  const assetsDir = deps.assetsDir ?? DEFAULT_ASSETS_DIR
  const nowFn = deps.now ?? (() => new Date())

  const ctx = loadReplayContext(params.assetId, {
    ...(deps.assetRepo !== undefined ? { assetRepo } : {}),
    ...(deps.resolveModel !== undefined ? { resolveModel: deps.resolveModel } : {}),
    ...(deps.hasActiveKey !== undefined ? { hasActiveKey: deps.hasActiveKey } : {}),
  })

  batchRepo.create({
    id: params.newBatchId,
    profileId: ctx.sourceAsset.profileId,
    workflowId: ctx.sourceAsset.workflowId,
    totalAssets: 1,
    status: "running",
    startedAt: nowFn().toISOString(),
    replayOfBatchId: ctx.sourceAsset.batchId,
    replayOfAssetId: ctx.sourceAsset.id,
  })

  yield { type: "started", batchId: params.newBatchId, total: 1 }

  if (params.abortSignal.aborted) {
    finalizeBatch({
      batchId: params.newBatchId,
      status: "aborted",
      assetRepo,
      batchRepo,
      at: nowFn().toISOString(),
    })
    yield {
      type: "aborted",
      batchId: params.newBatchId,
      completedCount: 0,
      totalCount: 1,
    }
    return
  }

  const provider = resolveProvider(ctx.payload.providerId)
  try {
    const generateResult = await provider.generate({
      prompt: ctx.payload.promptRaw,
      modelId: ctx.payload.modelId,
      aspectRatio: ctx.payload.aspectRatio,
      ...(ctx.payload.seed !== undefined && ctx.payload.seed !== null
        ? { seed: ctx.payload.seed }
        : {}),
      ...(ctx.payload.language !== undefined && ctx.payload.language !== null
        ? { language: ctx.payload.language }
        : {}),
      abortSignal: params.abortSignal,
      providerSpecificParams: { addWatermark: false },
    })

    const newAsset = writeReplayAsset(
      {
        sourceAsset: ctx.sourceAsset,
        newBatchId: params.newBatchId,
        generateResult,
        payload: ctx.payload,
        model: ctx.model,
        assetsDir,
        now: nowFn(),
      },
      assetRepo,
    )

    yield { type: "image_generated", asset: toAssetDto(newAsset), index: 0 }

    finalizeBatch({
      batchId: params.newBatchId,
      status: "completed",
      assetRepo,
      batchRepo,
      at: nowFn().toISOString(),
    })
    yield { type: "complete", assets: [toAssetDto(newAsset)], batchId: params.newBatchId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    yield {
      type: "error",
      error: { message },
      context: `replay of asset=${ctx.sourceAsset.id}`,
      index: 0,
    }
    finalizeBatch({
      batchId: params.newBatchId,
      status: "error",
      assetRepo,
      batchRepo,
      at: nowFn().toISOString(),
    })
    yield { type: "complete", assets: [], batchId: params.newBatchId }
  }
}
