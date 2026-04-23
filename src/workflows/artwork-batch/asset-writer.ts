// BOOTSTRAP-PHASE3 Step 3 — per-variant asset persistence for artwork-batch.
//
// Splits the DB / filesystem side-effects out of run.ts so the generator
// loop stays readable and the LOC budget (<300) holds. Path layout per
// Q3 decision: `data/assets/{profileId}/{YYYY-MM-DD}/{assetId}.png` —
// avoids flat-exploding a single directory into 10k+ files.

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import type { AssetDto } from "@/core/dto/asset-dto"
import type { GenerateResult } from "@/core/providers/types"
import type { AppProfile } from "@/core/schemas/app-profile"
import type { AspectRatio, LanguageCode, ModelInfo } from "@/core/model-registry/types"
import { computeReplayClass } from "@/core/shared/replay-class"
import { shortId } from "@/core/shared/id"
import type { AssetInsertInput, AssetRepo } from "@/server/asset-store"
import { toAssetDto } from "@/server/asset-store"

export const DEFAULT_ASSETS_DIR = resolve(process.cwd(), "data", "assets")

export interface AssetWriteInput {
  profile: AppProfile
  batchId: string
  concept: { id: string; title: string; seed: number }
  prompt: string
  providerId: string
  model: ModelInfo
  aspectRatio: AspectRatio
  language: LanguageCode | undefined
  tagGroup: string
  generateResult: GenerateResult
  assetsDir: string
  now: Date
}

function buildReplayPayload(input: AssetWriteInput): string {
  return JSON.stringify({
    version: 1,
    profileVersion: input.profile.version,
    promptRaw: input.prompt,
    providerId: input.providerId,
    modelId: input.model.id,
    seed: input.concept.seed,
    aspectRatio: input.aspectRatio,
    language: input.language ?? null,
  })
}

function buildInputParams(input: AssetWriteInput): string {
  return JSON.stringify({
    conceptTitle: input.concept.title,
    tagGroup: input.tagGroup,
  })
}

export function writeAssetAndInsert(
  input: AssetWriteInput,
  assetRepo: AssetRepo,
): AssetDto {
  const assetId = shortId("ast", 10)
  const datePart = input.now.toISOString().slice(0, 10)  // YYYY-MM-DD
  const filePath = join(input.assetsDir, input.profile.id, datePart, `${assetId}.png`)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, input.generateResult.imageBytes)

  // Session #15 Q5 — classify via shared helper. Mock doesn't apply a
  // watermark so we pass `addWatermark: false` explicitly; unset would
  // collapse to "best_effort" (helper treats absence as ambiguous).
  const replayClass = computeReplayClass(input.model.capability, {
    seed: input.concept.seed,
    providerSpecificParams: { addWatermark: false },
  })

  const row: AssetInsertInput = {
    id: assetId,
    profileId: input.profile.id,
    profileVersionAtGen: input.profile.version,
    workflowId: "artwork-batch",
    batchId: input.batchId,
    variantGroup: input.concept.title,
    promptRaw: input.prompt,
    inputParams: buildInputParams(input),
    replayPayload: buildReplayPayload(input),
    replayClass,
    providerId: input.providerId,
    modelId: input.model.id,
    seed: input.concept.seed,
    aspectRatio: input.aspectRatio,
    ...(input.language !== undefined ? { language: input.language } : {}),
    filePath,
    width: input.generateResult.width,
    height: input.generateResult.height,
    fileSizeBytes: input.generateResult.imageBytes.byteLength,
    status: "completed",
    generationTimeMs: input.generateResult.generationTimeMs,
    costUsd: input.generateResult.costUsd,
    tags: [input.tagGroup],
    createdAt: input.now.toISOString(),
  }

  const inserted = assetRepo.insert(row)
  return toAssetDto(inserted)
}
