// Session #15 — per-variant asset persistence for aso-screenshots.
//
// Each asset is a (concept × targetLang × variant) tuple; all three
// dimensions are stamped onto inputParams + replayPayload so Phase 5
// replay can reconstruct the exact prompt. Asset seed derives from
// Q7 salt `${layoutId}:${targetLang}` (shared across variants of the
// same (concept, lang) — variants differentiate via prompt only).

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import type { AssetDto } from "@/core/dto/asset-dto"
import type { GenerateResult } from "@/core/providers/types"
import type { AppProfile } from "@/core/schemas/app-profile"
import type { AspectRatio, LanguageCode, ModelInfo } from "@/core/model-registry/types"
import { computeReplayClass } from "@/core/shared/replay-class"
import { shortId } from "@/core/shared/id"
import type { CopyLang } from "@/core/templates"
import type { AssetInsertInput, AssetRepo } from "@/server/asset-store"
import { toAssetDto } from "@/server/asset-store"

import type { AsoConcept } from "./types"

export const DEFAULT_ASSETS_DIR = resolve(process.cwd(), "data", "assets")

export interface AsoAssetWriteInput {
  profile: AppProfile
  batchId: string
  concept: AsoConcept
  prompt: string
  providerId: string
  model: ModelInfo
  aspectRatio: AspectRatio
  language: LanguageCode | undefined
  targetLang: CopyLang
  assetSeed: number
  generateResult: GenerateResult
  assetsDir: string
  now: Date
  variantIndex: number
}

function buildReplayPayload(input: AsoAssetWriteInput): string {
  return JSON.stringify({
    version: 1,
    profileVersion: input.profile.version,
    promptRaw: input.prompt,
    providerId: input.providerId,
    modelId: input.model.id,
    seed: input.assetSeed,
    aspectRatio: input.aspectRatio,
    language: input.language ?? null,
    layoutId: input.concept.layoutId,
    targetLang: input.targetLang,
    variantIndex: input.variantIndex,
  })
}

function buildInputParams(input: AsoAssetWriteInput): string {
  return JSON.stringify({
    layoutId: input.concept.layoutId,
    targetLang: input.targetLang,
    variantIndex: input.variantIndex,
  })
}

export function writeAsoAsset(
  input: AsoAssetWriteInput,
  assetRepo: AssetRepo,
): AssetDto {
  const assetId = shortId("ast", 10)
  const datePart = input.now.toISOString().slice(0, 10)
  const filePath = join(input.assetsDir, input.profile.id, datePart, `${assetId}.png`)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, input.generateResult.imageBytes)

  const replayClass = computeReplayClass(input.model.capability, {
    seed: input.assetSeed,
    providerSpecificParams: { addWatermark: false },
  })

  const row: AssetInsertInput = {
    id: assetId,
    profileId: input.profile.id,
    profileVersionAtGen: input.profile.version,
    workflowId: "aso-screenshots",
    batchId: input.batchId,
    variantGroup: `${input.concept.layoutId}:${input.targetLang}`,
    promptRaw: input.prompt,
    inputParams: buildInputParams(input),
    replayPayload: buildReplayPayload(input),
    replayClass,
    providerId: input.providerId,
    modelId: input.model.id,
    seed: input.assetSeed,
    aspectRatio: input.aspectRatio,
    ...(input.language !== undefined ? { language: input.language } : {}),
    filePath,
    width: input.generateResult.width,
    height: input.generateResult.height,
    fileSizeBytes: input.generateResult.imageBytes.byteLength,
    status: "completed",
    generationTimeMs: input.generateResult.generationTimeMs,
    costUsd: input.model.costPerImageUsd,
    tags: [input.concept.layoutId, input.targetLang],
    createdAt: input.now.toISOString(),
  }

  const inserted = assetRepo.insert(row)
  return toAssetDto(inserted)
}
