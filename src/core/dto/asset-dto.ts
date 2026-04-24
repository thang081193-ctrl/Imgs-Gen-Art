// Plan §6.4 — AssetDto + AssetDetailDto. No filesystem paths (Rule 11).

import type { WorkflowId } from "../design/types"
import type { ReplayPayloadDto } from "./replay-payload-dto"

export type AssetStatus = "completed" | "error"
export type ReplayClass = "deterministic" | "best_effort" | "not_replayable"

// Session #26 (Phase 5 Step 2 fold-in) — reason derivation for not_replayable
// drives the disabled-replay-button tooltip copy in AssetDetailModal. Client
// discriminates on `replayClass === "not_replayable"` in the /replay-class
// probe response and maps reason → tooltip copy in replay-errors.ts.
export type NotReplayableReason =
  | "seed_missing"
  | "provider_no_seed_support"
  | "watermark_applied"

// Session #27a — edit-mode affordance for the asset DTO. `canEdit` is
// orthogonal to replayClass: it gates the 27b PromptLab `[Edit & replay]`
// button. Legacy payloads (pre-Session-#27) are replayable but not editable
// because we'd have to synthesize a contextSnapshot from current profile
// state — silent drift from batch-time. Reason is only set when canEdit
// is false AND it's specifically a payload-shape reason (not a
// not_replayable overlap; UI priority handles that in 27b).
export type EditableReason = "legacy_payload"
export interface EditableFlag {
  canEdit: boolean
  reason?: EditableReason
}

export interface AssetDto {
  id: string
  profileId: string
  profileVersionAtGen: number
  workflowId: WorkflowId
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

  imageUrl: string | null
  width: number | null
  height: number | null
  fileSizeBytes: number | null

  status: AssetStatus
  errorMessage: string | null

  generationTimeMs: number | null
  costUsd: number | null

  replayClass: ReplayClass
  replayedFromAssetId: string | null
  // Session #35 F1: number of descendant assets that have this asset as
  // their replay source. Deleting this asset CASCADEs those descendants
  // away, so the UI warns when > 0 before confirming a destructive op.
  replayDescendantCount: number
  editable: EditableFlag

  tags: string[]
  notes: string | null

  createdAt: string
}

export interface AssetDetailDto extends AssetDto {
  replayPayload: ReplayPayloadDto | null
}
