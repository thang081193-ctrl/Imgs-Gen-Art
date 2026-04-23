// Rule 11 — no filesystem paths in API responses.
// `filePath` is persisted on AssetInternal for server-side file serving only;
// this mapper strips it and produces the client-facing shape with an opaque
// URL route instead. `toAssetDetailDto` (adds replayPayload) arrives in
// Phase 3 when the replay snapshot includes a mapped ProfileDto.
//
// Session #27a — adds `editable: { canEdit, reason? }` computed on the fly
// from replay_payload shape. Light key-check avoids importing Zod here;
// keeps the mapper synchronous and O(1) per row (no full schema parse on
// list endpoints). `canEdit` is false for `not_replayable` assets (replay
// is blocked, so edit can't run either — shares the seed constraint); the
// UI-layer tooltip priority (27b) decides which disabled message wins.

import type { AssetDto, EditableFlag } from "@/core/dto/asset-dto"
import type { AssetInternal } from "./types"

function computeEditable(asset: AssetInternal): EditableFlag {
  if (asset.replayClass === "not_replayable") {
    return { canEdit: false }
  }
  if (asset.replayPayload === null || asset.replayPayload.length === 0) {
    return { canEdit: false, reason: "legacy_payload" }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(asset.replayPayload)
  } catch {
    return { canEdit: false, reason: "legacy_payload" }
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "prompt" in parsed &&
    "contextSnapshot" in parsed
  ) {
    return { canEdit: true }
  }
  return { canEdit: false, reason: "legacy_payload" }
}

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
    imageUrl: asset.status === "completed" ? `/api/assets/${asset.id}/file` : null,
    width: asset.width,
    height: asset.height,
    fileSizeBytes: asset.fileSizeBytes,
    status: asset.status,
    errorMessage: asset.errorMessage,
    generationTimeMs: asset.generationTimeMs,
    costUsd: asset.costUsd,
    replayClass: asset.replayClass,
    replayedFromAssetId: asset.replayedFrom,
    editable: computeEditable(asset),
    tags: asset.tags,
    notes: asset.notes,
    createdAt: asset.createdAt,
  }
}
