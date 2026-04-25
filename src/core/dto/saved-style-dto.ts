// Session #37 PLAN-v3 §6 — Saved Styles client-facing DTO.
//
// Returned by GET /api/saved-styles + GET /api/saved-styles/:id. Rule 11:
// `preview_asset_id` is exposed as both the raw FK (for client-side joins
// against /api/assets/:id) and a pre-resolved `previewAssetUrl` pointing
// at the existing /api/assets/:id/file route — clients shouldn't have to
// stitch the URL themselves.
//
// `lanes` is the parsed JSON array form of the stored lanes_json column.
// Tag values follow the dotted lane.platform convention from PLAN-v3 §1.2:
// "ads.meta" | "ads.google-ads" | "aso.play". Forward-compat: future lanes
// (e.g. "video.tiktok") slot in without DTO migration.

export type SavedStyleKind = "preset-legacy" | "user"

export type SavedStyleLaneTag =
  | "ads.meta"
  | "ads.google-ads"
  | "aso.play"
  | (string & {})

export interface SavedStyleDto {
  id: string
  slug: string
  name: string
  description: string | null
  kind: SavedStyleKind
  promptTemplate: string
  previewAssetId: string | null
  previewAssetUrl: string | null
  lanes: SavedStyleLaneTag[]
  usageCount: number
  createdAt: string
  updatedAt: string
}
