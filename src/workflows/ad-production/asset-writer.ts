// Session #15 — per-variant asset persistence for ad-production.
//
// Mirrors artwork-batch/asset-writer.ts: file write → replay-class compute →
// DB insert → AssetDto return. Diverges only in:
//   - hardcoded workflowId: "ad-production"
//   - buildInputParams shape (AdConcept-specific)
//   - replayPayload includes layoutId/copyKey/featureFocus so Phase 5
//     replay can reconstruct the full prompt from the same input triple
//   - variantGroup keyed by concept.title which already encodes the
//     (layoutId · copyKey) pair — no extra field needed
//   - tags includes featureFocus + layoutId + copyKey for filter UI

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

import type { AdConcept } from "./types"

export const DEFAULT_ASSETS_DIR = resolve(process.cwd(), "data", "assets")

export interface AdAssetWriteInput {
  profile: AppProfile
  batchId: string
  concept: AdConcept
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

function buildReplayPayload(input: AdAssetWriteInput): string {
  return JSON.stringify({
    version: 1,
    profileVersion: input.profile.version,
    promptRaw: input.prompt,
    providerId: input.providerId,
    modelId: input.model.id,
    seed: input.concept.seed,
    aspectRatio: input.aspectRatio,
    language: input.language ?? null,
    layoutId: input.concept.layoutId,
    copyKey: input.concept.copyKey,
    featureFocus: input.concept.featureFocus,
    variantIndex: input.variantIndex,
  })
}

function buildInputParams(input: AdAssetWriteInput): string {
  return JSON.stringify({
    layoutId: input.concept.layoutId,
    copyKey: input.concept.copyKey,
    featureFocus: input.concept.featureFocus,
    variantIndex: input.variantIndex,
  })
}

export function writeAdAsset(
  input: AdAssetWriteInput,
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
    workflowId: "ad-production",
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
    tags: [input.concept.featureFocus, input.concept.layoutId, input.concept.copyKey],
    createdAt: input.now.toISOString(),
  }

  const inserted = assetRepo.insert(row)
  return toAssetDto(inserted)
}
