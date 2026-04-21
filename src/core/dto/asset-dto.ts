// Plan §6.4 — AssetDto + AssetDetailDto. No filesystem paths (Rule 11).

import type { ReplayPayloadDto } from "./replay-payload-dto"

export type AssetStatus = "completed" | "error"
export type ReplayClass = "deterministic" | "best_effort" | "not_replayable"

export interface AssetDto {
  id: string
  profileId: string
  profileVersionAtGen: number
  workflowId: string
  batchId: string | null
  variantGroup: string | null

  promptRaw: string
  promptTemplateId: string | null
  promptTemplateVersion: string | null

  providerId: string
  modelId: string
  seed: number | null
  aspectRatio: string
  language: string | null

  imageUrl: string
  width: number | null
  height: number | null
  fileSizeBytes: number | null

  status: AssetStatus
  errorMessage: string | null

  generationTimeMs: number | null
  costUsd: number | null

  replayClass: ReplayClass
  replayedFromAssetId: string | null

  tags: string[]
  notes: string | null

  createdAt: string
}

export interface AssetDetailDto extends AssetDto {
  replayPayload: ReplayPayloadDto | null
}
