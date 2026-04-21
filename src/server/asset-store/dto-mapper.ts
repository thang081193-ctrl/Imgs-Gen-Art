// Rule 11 — no filesystem paths in API responses.
// `filePath` is persisted on AssetInternal for server-side file serving only;
// this mapper strips it and produces the client-facing shape with an opaque
// URL route instead. `toAssetDetailDto` (adds replayPayload) arrives in
// Phase 3 when the replay snapshot includes a mapped ProfileDto.

import type { AssetDto } from "@/core/dto/asset-dto"
import type { AssetInternal } from "./types"

export function toAssetDto(asset: AssetInternal): AssetDto {
  return {
    id: asset.id,
    profileId: asset.profileId,
    profileVersionAtGen: asset.profileVersionAtGen,
    workflowId: asset.workflowId,
    batchId: asset.batchId,
    variantGroup: asset.variantGroup,
    promptRaw: asset.promptRaw,
    promptTemplateId: asset.promptTemplateId,
    promptTemplateVersion: asset.promptTemplateVersion,
    providerId: asset.providerId,
    modelId: asset.modelId,
    seed: asset.seed,
    aspectRatio: asset.aspectRatio,
    language: asset.language,
    imageUrl: `/api/assets/${asset.id}/file`,
    width: asset.width,
    height: asset.height,
    fileSizeBytes: asset.fileSizeBytes,
    status: asset.status,
    errorMessage: asset.errorMessage,
    generationTimeMs: asset.generationTimeMs,
    costUsd: asset.costUsd,
    replayClass: asset.replayClass,
    replayedFromAssetId: asset.replayedFrom,
    tags: asset.tags,
    notes: asset.notes,
    createdAt: asset.createdAt,
  }
}
