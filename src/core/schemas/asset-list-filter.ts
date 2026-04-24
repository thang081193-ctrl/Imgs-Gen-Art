// Session #28 (Phase 5 Step 3) — AssetListFilter Zod schema shared by the
// `GET /api/assets` route and the Gallery filter UI. Strict allowlist: any
// unknown query key → 400. Plural fields (profileIds/workflowIds/…) carry
// CSV strings over the wire and hydrate to arrays in-memory; `batchId` stays
// singular because exact-batch-match has no set semantics in v1.
//
// Backward-compat: legacy `profileId` / `workflowId` singulars are merged
// into the plural equivalents via `.transform()`. Drops next session once
// Gallery fully switches to plural URL params.
//
// Tag filtering uses LIKE scan on the JSON `tags TEXT` column per DECISIONS
// §C1 (asset_tags JOIN table deferred post-v1). OR/AND semantics controlled
// by `tagMatchMode` (default "any"). Date preset boundaries derive at the
// SQL-build site so the schema stays pure + client-safe.
//
// Session #29 will migrate pagination offset/limit → cursor-based.

import { z } from "zod"
import type { ReplayClass } from "../dto/asset-dto"

export const ReplayClassValues = [
  "deterministic",
  "best_effort",
  "not_replayable",
] as const satisfies readonly ReplayClass[]

export const DatePresetValues = ["all", "today", "7d", "30d"] as const
export type DatePreset = (typeof DatePresetValues)[number]

// Session #32 F3 — custom range pickers. ISO date-only strings (no time
// component). Either bound may be omitted for open-ended windows. When
// either is set, the SQL builder ignores `datePreset` so power users aren't
// double-filtered from a stale preset choice (DECISIONS §G F3).
const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const TagMatchModeValues = ["any", "all"] as const
export type TagMatchMode = (typeof TagMatchModeValues)[number]

// Preprocessor: accept undefined | "" | CSV string | string[] → string[] | undefined.
// Empty string + empty array both collapse to undefined so a present-but-empty
// filter param is equivalent to an absent one (prevents `IN ()` SQL pitfall).
function csvArray<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined
    if (Array.isArray(val)) return val.length === 0 ? undefined : val
    const parts = String(val).split(",").map((s) => s.trim()).filter(Boolean)
    return parts.length === 0 ? undefined : parts
  }, z.array(item).min(1).optional())
}

// Like `csvArray`, but distinguishes absent (undefined) from present-but-empty
// (`[]`). Used for `replayClasses` so the Gallery UI can express "0 of 3
// checkboxes selected = match none" (Session #29 Q-29.E). The query builder
// renders `[]` as a `1 = 0` clause so the server returns zero rows.
function csvArrayPreserveEmpty<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess((val) => {
    if (val === undefined || val === null) return undefined
    if (Array.isArray(val)) return val
    if (val === "") return []
    const parts = String(val).split(",").map((s) => s.trim()).filter(Boolean)
    return parts
  }, z.array(item).optional())
}

// Wire-level query schema. `.strict()` rejects unknown keys to keep the URL
// contract tight. Transform merges singular legacy params into plural arrays.
export const AssetListFilterSchema = z
  .object({
    profileIds: csvArray(z.string().min(1)),
    workflowIds: csvArray(z.string().min(1)),
    tags: csvArray(z.string().min(1)),
    providerIds: csvArray(z.string().min(1)),
    modelIds: csvArray(z.string().min(1)),
    replayClasses: csvArrayPreserveEmpty(z.enum(ReplayClassValues)),
    tagMatchMode: z.enum(TagMatchModeValues).optional(),
    datePreset: z.enum(DatePresetValues).optional(),
    dateFrom: z.string().regex(DATE_ISO_REGEX).optional(),
    dateTo: z.string().regex(DATE_ISO_REGEX).optional(),
    batchId: z.string().min(1).optional(),
    profileId: z.string().min(1).optional(),
    workflowId: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(100).default(50),
    offset: z.coerce.number().int().nonnegative().optional(),
  })
  .strict()
  .transform((raw) => {
    const profileIds = mergeLegacy(raw.profileIds, raw.profileId)
    const workflowIds = mergeLegacy(raw.workflowIds, raw.workflowId)
    return {
      profileIds,
      workflowIds,
      tags: raw.tags,
      providerIds: raw.providerIds,
      modelIds: raw.modelIds,
      replayClasses: raw.replayClasses as ReplayClass[] | undefined,
      tagMatchMode: raw.tagMatchMode,
      datePreset: raw.datePreset,
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      batchId: raw.batchId,
      limit: raw.limit,
      offset: raw.offset,
    }
  })

export type AssetListFilter = z.infer<typeof AssetListFilterSchema>

function mergeLegacy(
  plural: string[] | undefined,
  singular: string | undefined,
): string[] | undefined {
  if (plural && plural.length > 0) return plural
  if (singular) return [singular]
  return undefined
}

// Default filter — useful as a safe starting point for tests + UI state.
export function emptyAssetListFilter(): AssetListFilter {
  return {
    profileIds: undefined,
    workflowIds: undefined,
    tags: undefined,
    providerIds: undefined,
    modelIds: undefined,
    replayClasses: undefined,
    tagMatchMode: undefined,
    datePreset: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    batchId: undefined,
    limit: 50,
    offset: undefined,
  }
}
