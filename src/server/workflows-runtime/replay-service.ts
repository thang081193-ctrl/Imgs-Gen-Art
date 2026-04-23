// Session #27a — Phase 5 Step 5a. Extends Session #25's replay service with:
//   1. Dual-reader shape detection — canonical ReplayPayloadSchema first,
//      fall back to inlined legacy detection (presence of `promptRaw` key)
//      to keep 105+ pre-migration rows on bro's home PC replayable during
//      the transition. `replay-payload-shape.ts` is deleted; the legacy
//      schema is private to this module.
//   2. `overridePayload` support for body.mode === "edit" — allowlisted via
//      OverridePayloadSchema (prompt | addWatermark | negativePrompt),
//      gated by model capability (negativePrompt requires
//      supportsNegativePrompt). Rejects legacy sources with
//      LegacyPayloadNotEditableError to prevent silent profileSnapshot
//      drift (synthesizing from current profile = wrong semantically).
//
// Probe moved to replay-probe.ts (carry-forward #6 from Session #26 — LOC
// soft cap was tight; dual reader + override logic would blow past 300).

import { resolve } from "node:path"

import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import type { ModelInfo } from "@/core/model-registry/types"
import { getModel } from "@/core/model-registry/models"
import type { ImageProvider } from "@/core/providers/types"
import type { OverridePayload } from "@/core/schemas/override-payload"
import type { ReplayPayload } from "@/core/schemas/replay-payload"
import {
  BadRequestError,
  CapabilityNotSupportedError,
  LegacyPayloadNotEditableError,
  NoActiveKeyError,
  NotFoundError,
} from "@/core/shared/errors"
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
import type { ReplayExecuteFields } from "./replay-execute-fields"
import { normalizePayload, type ReplayPayloadKind } from "./replay-payload-reader"

export { type ReplayExecuteFields } from "./replay-execute-fields"

export const DEFAULT_ASSETS_DIR = resolve(process.cwd(), "data", "assets")

export interface LoadedReplayContext {
  sourceAsset: AssetInternal
  model: ModelInfo
  execute: ReplayExecuteFields
  kind: ReplayPayloadKind
  canonical: ReplayPayload | null
  storedPayloadJson: string
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
  const { kind, canonical, execute } = normalizePayload(raw, assetId)

  const model = resolveModel(execute.modelId)
  if (!model || model.providerId !== execute.providerId) {
    throw new BadRequestError(
      `Stored model '${execute.modelId}' no longer registered for provider '${execute.providerId}'`,
      { modelId: execute.modelId, providerId: execute.providerId },
    )
  }
  if (!hasActiveKey(execute.providerId)) {
    throw new NoActiveKeyError(
      `No active key for provider '${execute.providerId}' — rotate or add before replay`,
      { providerId: execute.providerId },
    )
  }

  return {
    sourceAsset,
    model,
    execute,
    kind,
    canonical,
    storedPayloadJson: sourceAsset.replayPayload,
  }
}

function applyOverride(
  ctx: LoadedReplayContext,
  override: OverridePayload,
): { execute: ReplayExecuteFields; newPayloadJson: string } {
  // Legacy source → synthesizing a canonical contextSnapshot from current
  // profile state would drift from the batch-time profile. Reject loudly
  // instead of silently corrupting the audit trail.
  if (ctx.kind === "legacy" || ctx.canonical === null) {
    throw new LegacyPayloadNotEditableError(ctx.sourceAsset.id)
  }
  if (
    override.negativePrompt !== undefined &&
    !ctx.model.capability.supportsNegativePrompt
  ) {
    throw new CapabilityNotSupportedError("negativePrompt", ctx.model.id)
  }

  const prompt = override.prompt ?? ctx.execute.prompt
  const addWatermark =
    override.addWatermark !== undefined ? override.addWatermark : ctx.execute.addWatermark
  const negativePrompt =
    override.negativePrompt !== undefined
      ? override.negativePrompt
      : ctx.execute.negativePrompt

  const execute: ReplayExecuteFields = {
    ...ctx.execute,
    prompt,
    addWatermark,
    ...(negativePrompt !== undefined ? { negativePrompt } : {}),
  }

  const newCanonical: ReplayPayload = {
    ...ctx.canonical,
    prompt,
    providerSpecificParams: {
      ...ctx.canonical.providerSpecificParams,
      addWatermark,
      ...(negativePrompt !== undefined ? { negativePrompt } : {}),
    },
  }
  return { execute, newPayloadJson: JSON.stringify(newCanonical) }
}

export interface ExecuteReplayParams {
  assetId: string
  newBatchId: string
  abortSignal: AbortSignal
  overridePayload?: OverridePayload
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

  const { execute, newPayloadJson } =
    params.overridePayload !== undefined
      ? applyOverride(ctx, params.overridePayload)
      : { execute: ctx.execute, newPayloadJson: ctx.storedPayloadJson }

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

  const provider = resolveProvider(execute.providerId)
  try {
    const generateResult = await provider.generate({
      prompt: execute.prompt,
      modelId: execute.modelId,
      aspectRatio: execute.aspectRatio,
      ...(execute.seed !== undefined ? { seed: execute.seed } : {}),
      ...(execute.language !== undefined ? { language: execute.language } : {}),
      abortSignal: params.abortSignal,
      providerSpecificParams: {
        addWatermark: execute.addWatermark,
        ...(execute.negativePrompt !== undefined
          ? { negativePrompt: execute.negativePrompt }
          : {}),
      },
    })

    const newAsset = writeReplayAsset(
      {
        sourceAsset: ctx.sourceAsset,
        newBatchId: params.newBatchId,
        generateResult,
        execute,
        replayPayloadJson: newPayloadJson,
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

