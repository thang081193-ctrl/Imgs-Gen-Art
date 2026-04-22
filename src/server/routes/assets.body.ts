// BOOTSTRAP-PHASE3 Step 6 — query schemas for /api/assets.
//
// Session #14 Q6 — `?include=` is CSV from day one. Only "replayPayload"
// is defined today; future Phase 5+ additions extend the enum without
// breaking the API shape (value-based, not flag-based).

import { z } from "zod"

export const AssetListQuerySchema = z.object({
  profileId: z.string().min(1).optional(),
  workflowId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export const AssetIncludeOptionSchema = z.enum(["replayPayload"])
export type AssetIncludeOption = z.infer<typeof AssetIncludeOptionSchema>

export function parseIncludeParam(raw: string | undefined): Set<AssetIncludeOption> {
  if (!raw) return new Set()
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean)
  const validated = parts.map((p) => AssetIncludeOptionSchema.parse(p))
  return new Set(validated)
}
