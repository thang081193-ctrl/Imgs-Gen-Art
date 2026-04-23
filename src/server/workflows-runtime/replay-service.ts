// Session #27a — Phase 5 Step 5a. Extends Session #25's replay service with:
//   1. Dual-reader shape detection — canonical ReplayPayloadSchema first,
//      fall back to inlined legacy detection (presence of `promptRaw` key)
//      to keep 105+ pre-migration rows on bro's home PC replayable during
//      the transition. `replay-payload-shape.ts` is deleted; the legacy
//      schema is private to this module.
//   2. `overridePayload` support for body.mode === "edit" — allowlisted via
//      OverridePayloadSchema (prompt | addWatermark | negativePrompt),
//      gated by model capability (negativePrompt requires
//      supportsNegativePrompt). Rejects legacy sources to prevent silent
//      profileSnapshot drift (synthesizing from current profile = wrong
//      semantically). Override logic lives in `./replay-override` (extracted
//      in Session #27b — carry-forward #4 from #27a, service was 251 LOC).
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
  NoActiveKeyError,
  NotFoundError,
} from "@/core/shared/errors"
import type { PromptHistoryOverrideParams } from "@/core/dto/prompt-history-dto"
import { shortId } from "@/core/shared/id"
import {
  finalizeBatch,
  getAssetRepo as getAssetRepoDefault,
  getBatchRepo as getBatchRepoDefault,
  getPromptHistoryRepo as getPromptHistoryRepoDefault,
  toAssetDto,
  type AssetInternal,
  type AssetRepo,
  type BatchRepo,
  type PromptHistoryRepo,
} from "@/server/asset-store"
import { loadStoredKeys } from "@/server/keys/store"
import { getProvider as getProviderDefault } from "@/server/providers"

import { writeReplayAsset } from "./replay-asset-writer"
import type { ReplayExecuteFields } from "./replay-execute-fields"
import { applyOverride } from "./replay-override"
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
  promptHistoryRepo?: PromptHistoryRepo
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

  // Phase 5 Step 5b — log the edit iteration. Mode=edit only: pure replays
  // are byte-deterministic duplicates and not worth surfacing as a distinct
  // "iteration" in PromptLab. history repo lookup is lazy (only when edit)
  // so test setups that don't boot the full asset-store still pass.
  const historyId =
    params.overridePayload !== undefined ? shortId("ph", 10) : null
  const promptHistoryRepo =
    historyId !== null
      ? deps.promptHistoryRepo ?? getPromptHistoryRepoDefault()
      : null
  if (historyId !== null && promptHistoryRepo !== null) {
    const src = params.overridePayload ?? {}
    const overrideParams: PromptHistoryOverrideParams = {
      ...(src.addWatermark !== undefined ? { addWatermark: src.addWatermark } : {}),
      ...(src.negativePrompt !== undefined
        ? { negativePrompt: src.negativePrompt }
        : {}),
    }
    promptHistoryRepo.insert({
      id: historyId,
      assetId: ctx.sourceAsset.id,
      profileId: ctx.sourceAsset.profileId,
      promptRaw: execute.prompt,
      overrideParams,
      createdAt: nowFn().toISOString(),
    })
  }

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
    if (historyId !== null && promptHistoryRepo !== null) {
      promptHistoryRepo.updateStatus(historyId, { status: "cancelled" })
    }
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

    if (historyId !== null && promptHistoryRepo !== null) {
      promptHistoryRepo.updateStatus(historyId, {
        status: "complete",
        resultAssetId: newAsset.id,
        costUsd: generateResult.costUsd ?? null,
      })
    }

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
    if (historyId !== null && promptHistoryRepo !== null) {
      promptHistoryRepo.updateStatus(historyId, {
        status: "failed",
        errorMessage: message,
      })
    }
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

