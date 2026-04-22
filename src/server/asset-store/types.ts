// Internal server-side row shapes for the asset-store.
// Distinct from @/core/dto/asset-dto (which is the client-facing shape and
// omits Rule 11 internals like `filePath`). Repos return these internal
// shapes; route handlers call @/server/asset-store/dto-mapper → AssetDto
// before responding.

import type { AssetStatus, ReplayClass } from "@/core/dto/asset-dto"
import type { WorkflowId } from "@/core/design/types"
import type { AspectRatio, LanguageCode } from "@/core/model-registry/types"

export interface AssetInternal {
  id: string
  profileId: string
  profileVersionAtGen: number
  workflowId: WorkflowId
  batchId: string | null
  variantGroup: string | null

  promptRaw: string
  promptTemplateId: string | null
  promptTemplateVersion: string | null
  inputParams: string
  replayPayload: string | null
  replayClass: ReplayClass

  providerId: string
  modelId: string
  seed: number | null
  aspectRatio: AspectRatio
  language: LanguageCode | null

  filePath: string
  width: number | null
  height: number | null
  fileSizeBytes: number | null

  status: AssetStatus
  errorMessage: string | null

  generationTimeMs: number | null
  costUsd: number | null

  tags: string[]
  notes: string | null
  replayedFrom: string | null

  createdAt: string
}

export interface AssetInsertInput {
  id: string
  profileId: string
  profileVersionAtGen: number
  workflowId: WorkflowId
  batchId?: string | null
  variantGroup?: string | null

  promptRaw: string
  promptTemplateId?: string | null
  promptTemplateVersion?: string | null
  inputParams: string
  replayPayload?: string | null
  replayClass: ReplayClass

  providerId: string
  modelId: string
  seed?: number | null
  aspectRatio: AspectRatio
  language?: LanguageCode | null

  filePath: string
  width?: number | null
  height?: number | null
  fileSizeBytes?: number | null

  status: AssetStatus
  errorMessage?: string | null

  generationTimeMs?: number | null
  costUsd?: number | null

  tags?: string[]
  notes?: string | null
  replayedFrom?: string | null

  createdAt?: string
}

export interface AssetListFilter {
  profileId?: string
  workflowId?: string
  batchId?: string
  limit: number
  offset?: number
}

export type BatchStatus = "running" | "completed" | "aborted" | "error"

export interface BatchInternal {
  id: string
  profileId: string
  workflowId: WorkflowId
  totalAssets: number
  successfulAssets: number
  totalCostUsd: number | null
  status: BatchStatus
  startedAt: string
  completedAt: string | null
  abortedAt: string | null
}

export interface BatchCreateInput {
  id: string
  profileId: string
  workflowId: WorkflowId
  totalAssets: number
  successfulAssets?: number
  totalCostUsd?: number | null
  status: BatchStatus
  startedAt?: string
}
