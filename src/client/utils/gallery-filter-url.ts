// Phase 5 Step 3b (Session #29) — Gallery URL-sync helpers. Split out of
// Gallery.tsx so the page component stays close to the 250 LOC soft cap.
//
// The schema round-trip is lenient by design: any invalid query key drops
// the whole filter back to the default (via `safeParse`), so a stale link
// or a hand-edited URL never throws in the address bar.

import {
  AssetListFilterSchema,
  emptyAssetListFilter,
} from "@/core/schemas/asset-list-filter"
import type { AssetListFilter } from "@/core/schemas/asset-list-filter"

export function decodeGalleryFilter(search: string): AssetListFilter {
  const params = new URLSearchParams(search)
  const raw: Record<string, string> = {}
  for (const [k, v] of params.entries()) raw[k] = v
  const result = AssetListFilterSchema.safeParse(raw)
  return result.success ? result.data : emptyAssetListFilter()
}

export function hasAnyFilter(f: AssetListFilter): boolean {
  return f.profileIds !== undefined
    || f.workflowIds !== undefined
    || f.tags !== undefined
    || f.tagMatchMode !== undefined
    || f.datePreset !== undefined
    || f.dateFrom !== undefined
    || f.dateTo !== undefined
    || f.providerIds !== undefined
    || f.modelIds !== undefined
    || f.replayClasses !== undefined
    || f.batchId !== undefined
}

// `buildAssetsQueryString` always appends `limit=…&offset=…`; strip both so
// the address bar stays on just the filter dimensions.
export function stripPagination(qs: string): string {
  return qs.split("&").filter((p) => !p.startsWith("limit=") && !p.startsWith("offset=")).join("&")
}
