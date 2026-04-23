// Phase 5 Step 1 (Session #25) — replay asset persistence helper.
//
// Split from replay-service.ts to keep that file under CONTRIBUTING Rule 7
// soft cap (250 LOC). Mirrors the per-workflow asset-writer convention
// (writeAssetAndInsert in each src/workflows/<id>/asset-writer.ts) but is
// generic: every field beyond what the stored replay payload carries is
// inherited from the source asset row — replay-asset keeps the same
// workflowId, profileId, profileVersionAtGen, variantGroup, tags,
// promptTemplateId/Version as its source so Gallery filters continue to
// group them naturally.

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { GenerateResult } from "@/core/providers/types"
import type { ModelInfo } from "@/core/model-registry/types"
import { shortId } from "@/core/shared/id"
import type {
  AssetInsertInput,
  AssetInternal,
  AssetRepo,
} from "@/server/asset-store"
import type { StoredReplayPayload } from "./replay-payload-shape"

export interface ReplayAssetWriteInput {
  sourceAsset: AssetInternal
  newBatchId: string
  generateResult: GenerateResult
  payload: StoredReplayPayload
  model: ModelInfo
  assetsDir: string
  now: Date
}

export function writeReplayAsset(
  input: ReplayAssetWriteInput,
  assetRepo: AssetRepo,
): AssetInternal {
  const assetId = shortId("ast", 10)
  const datePart = input.now.toISOString().slice(0, 10)
  const filePath = join(
    input.assetsDir,
    input.sourceAsset.profileId,
    datePart,
    `${assetId}.png`,
  )
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, input.generateResult.imageBytes)

  const row: AssetInsertInput = {
    id: assetId,
    profileId: input.sourceAsset.profileId,
    profileVersionAtGen: input.sourceAsset.profileVersionAtGen,
    workflowId: input.sourceAsset.workflowId,
    batchId: input.newBatchId,
    variantGroup: input.sourceAsset.variantGroup,
    promptRaw: input.payload.promptRaw,
    promptTemplateId: input.sourceAsset.promptTemplateId,
    promptTemplateVersion: input.sourceAsset.promptTemplateVersion,
    inputParams: input.sourceAsset.inputParams,
    replayPayload: JSON.stringify(input.payload),
    replayClass: input.sourceAsset.replayClass,
    providerId: input.payload.providerId,
    modelId: input.payload.modelId,
    seed: input.payload.seed ?? null,
    aspectRatio: input.payload.aspectRatio,
    ...(input.payload.language !== undefined && input.payload.language !== null
      ? { language: input.payload.language }
      : {}),
    filePath,
    width: input.generateResult.width,
    height: input.generateResult.height,
    fileSizeBytes: input.generateResult.imageBytes.byteLength,
    status: "completed",
    generationTimeMs: input.generateResult.generationTimeMs,
    costUsd: input.generateResult.costUsd,
    tags: input.sourceAsset.tags,
    replayedFrom: input.sourceAsset.id,
    createdAt: input.now.toISOString(),
  }

  return assetRepo.insert(row)
}
