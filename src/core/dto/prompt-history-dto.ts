// Phase 5 Step 5b (Session #27b) — PromptLab history DTO.
//
// Client-facing shape for `GET /api/assets/:id/prompt-history`. No internal
// columns (Rule 11 — file paths stay server-side); the `created_by_session`
// column is v1-internal and not surfaced here.
//
// `overrideParams` is parsed from the stored JSON TEXT column into the
// canonical OverridePayload shape (subset: client may populate any
// combination of addWatermark/negativePrompt; prompt is tracked separately
// on promptRaw since it's the headline edit).

export type PromptHistoryStatus = "pending" | "complete" | "failed" | "cancelled"

export interface PromptHistoryOverrideParams {
  addWatermark?: boolean
  negativePrompt?: string
}

export interface PromptHistoryDto {
  id: string
  assetId: string | null
  resultAssetId: string | null
  parentHistoryId: string | null
  profileId: string
  promptRaw: string
  overrideParams: PromptHistoryOverrideParams
  createdAt: string
  status: PromptHistoryStatus
  costUsd: number | null
  errorMessage: string | null
}
