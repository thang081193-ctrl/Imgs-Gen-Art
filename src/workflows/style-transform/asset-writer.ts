// Session #15 — per-variant asset persistence for style-transform.
//
// Mirrors artwork-batch / ad-production asset-writers. Style-transform
// records the source profile-asset + style key in both `inputParams` and
// `replayPayload` so Phase 5 replay can re-run the transformation against
// the same source file.

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

import type { StyleConcept } from "./types"

export const DEFAULT_ASSETS_DIR = resolve(process.cwd(), "data", "assets")

export interface StyleAssetWriteInput {
  profile: AppProfile
  batchId: string
  concept: StyleConcept
  prompt: string
  providerId: string
  model: ModelInfo
  aspectRatio: AspectRatio
  language: LanguageCode | undefined
  generateResult: GenerateResult
  assetsDir: string
  now: Date
  variantIndex: number
}

function buildReplayPayload(input: StyleAssetWriteInput): string {
  return JSON.stringify({
    version: 1,
    profileVersion: input.profile.version,
    promptRaw: input.prompt,
    providerId: input.providerId,
    modelId: input.model.id,
    seed: input.concept.seed,
    aspectRatio: input.aspectRatio,
    language: input.language ?? null,
    sourceAssetId: input.concept.sourceAssetId,
    styleDnaKey: input.concept.styleDnaKey,
    serial: input.concept.serial,
    variantIndex: input.variantIndex,
  })
}

function buildInputParams(input: StyleAssetWriteInput): string {
  return JSON.stringify({
    sourceAssetId: input.concept.sourceAssetId,
    styleDnaKey: input.concept.styleDnaKey,
    serial: input.concept.serial,
    variantIndex: input.variantIndex,
  })
}

export function writeStyleAsset(
  input: StyleAssetWriteInput,
  assetRepo: AssetRepo,
): AssetDto {
  const assetId = shortId("ast", 10)
  const datePart = input.now.toISOString().slice(0, 10)
  const filePath = join(input.assetsDir, input.profile.id, datePart, `${assetId}.png`)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, input.generateResult.imageBytes)

  const replayClass = computeReplayClass(input.model.capability, {
    seed: input.concept.seed,
    providerSpecificParams: { addWatermark: false },
  })

  const row: AssetInsertInput = {
    id: assetId,
    profileId: input.profile.id,
    profileVersionAtGen: input.profile.version,
    workflowId: "style-transform",
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
    tags: [input.concept.styleDnaKey, input.concept.sourceAssetId],
    createdAt: input.now.toISOString(),
  }

  const inserted = assetRepo.insert(row)
  return toAssetDto(inserted)
}
