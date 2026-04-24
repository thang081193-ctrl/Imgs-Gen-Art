// BOOTSTRAP-PHASE3 Step 6 — query schemas for /api/assets.
//
// Session #14 Q6 — `?include=` is CSV from day one. Only "replayPayload"
// is defined today; future Phase 5+ additions extend the enum without
// breaking the API shape (value-based, not flag-based).
//
// Session #28 (Phase 5 Step 3) — list-query schema moved to
// `@/core/schemas/asset-list-filter` so client + server share the same
// strict allowlist. Re-exported here for backward source-compat.

import { z } from "zod"

export { AssetListFilterSchema } from "@/core/schemas/asset-list-filter"
export type { AssetListFilter } from "@/core/schemas/asset-list-filter"

export const AssetIncludeOptionSchema = z.enum(["replayPayload"])
export type AssetIncludeOption = z.infer<typeof AssetIncludeOptionSchema>

export function parseIncludeParam(raw: string | undefined): Set<AssetIncludeOption> {
  if (!raw) return new Set()
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean)
  const validated = parts.map((p) => AssetIncludeOptionSchema.parse(p))
  return new Set(validated)
}
