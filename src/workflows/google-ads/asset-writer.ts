// Phase E (Session #44) — google-ads text-asset writer.
//
// Each batch produces ONE text asset: a JSON file holding the
// {headlines, descriptions} bundle. width/height stay null (no image)
// and fileSizeBytes records the JSON byte length so audit/cost views
// stay populated. filePath under data/assets/<profile>/<date>/<id>.json
// mirrors the existing layout — same backup + cleanup story.

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import type { AssetDto } from "@/core/dto/asset-dto"
import type { AppProfile } from "@/core/schemas/app-profile"
import type { ModelInfo } from "@/core/model-registry/types"
import {
  ReplayPayloadSchema,
  type ReplayPayload,
} from "@/core/schemas/replay-payload"
import { computeReplayClass } from "@/core/shared/replay-class"
import { shortId } from "@/core/shared/id"
import type { AssetInsertInput, AssetRepo } from "@/server/asset-store"
import { toAssetDto } from "@/server/asset-store"

import type { GoogleAdConcept } from "./types"

export const DEFAULT_GOOGLE_ADS_DIR = resolve(process.cwd(), "data", "assets")

export interface GoogleAdsAssetWriteInput {
  profile: AppProfile
  batchId: string
  concept: GoogleAdConcept
  prompt: string
  providerId: string
  model: ModelInfo
  assetsDir: string
  now: Date
}

function buildReplayPayload(input: GoogleAdsAssetWriteInput): string {
  const payload: ReplayPayload = {
    version: 1,
    prompt: input.prompt,
    providerId: input.providerId,
    modelId: input.model.id,
    aspectRatio: "1:1",
    seed: input.concept.seed,
    providerSpecificParams: {},
    promptTemplateId: "google-ads",
    promptTemplateVersion: "1",
    contextSnapshot: {
      profileId: input.profile.id,
      profileVersion: input.profile.version,
      profileSnapshot: input.profile,
    },
  }
  return JSON.stringify(ReplayPayloadSchema.parse(payload))
}

function buildInputParams(input: GoogleAdsAssetWriteInput): string {
  return JSON.stringify({
    featureFocus: input.concept.featureFocus,
    headlineCount: input.concept.headlines.length,
    descriptionCount: input.concept.descriptions.length,
  })
}

export function writeGoogleAdAsset(
  input: GoogleAdsAssetWriteInput,
  assetRepo: AssetRepo,
): AssetDto {
  const assetId = shortId("ast", 10)
  const datePart = input.now.toISOString().slice(0, 10)
  const filePath = join(input.assetsDir, input.profile.id, datePart, `${assetId}.json`)

  mkdirSync(dirname(filePath), { recursive: true })
  const fileBody = JSON.stringify(
    {
      headlines: input.concept.headlines,
      descriptions: input.concept.descriptions,
      featureFocus: input.concept.featureFocus,
    },
    null,
    2,
  )
  writeFileSync(filePath, fileBody, "utf8")

  const replayClass = computeReplayClass(input.model.capability, {
    seed: input.concept.seed,
    providerSpecificParams: {},
  })

  const row: AssetInsertInput = {
    id: assetId,
    profileId: input.profile.id,
    profileVersionAtGen: input.profile.version,
    workflowId: "google-ads",
    batchId: input.batchId,
    variantGroup: input.concept.title,
    promptRaw: input.prompt,
    promptTemplateId: "google-ads",
    promptTemplateVersion: "1",
    inputParams: buildInputParams(input),
    replayPayload: buildReplayPayload(input),
    replayClass,
    providerId: input.providerId,
    modelId: input.model.id,
    seed: input.concept.seed,
    aspectRatio: "1:1",
    filePath,
    width: null,
    height: null,
    fileSizeBytes: Buffer.byteLength(fileBody, "utf8"),
    status: "completed",
    generationTimeMs: null,
    costUsd: null,
    tags: [input.concept.featureFocus, "text-only"],
    createdAt: input.now.toISOString(),
  }

  const inserted = assetRepo.insert(row)
  return toAssetDto(inserted)
}
