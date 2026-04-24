// Phase 5 Step 3b (Session #29) — client-side mirror of the server's
// `datePresetBoundary`. The wire still sends `datePreset=today|7d|30d` as a
// string; this util derives the equivalent ISO "after" boundary locally so the
// Gallery UI can show filter summaries, empty-state copy, and future custom-
// range pickers (carry-forward #16) without round-tripping the server.
//
// Semantics MUST match `src/server/asset-store/asset-list-query.ts`
// `datePresetBoundary`:
//   all   → null (no restriction)
//   today → local-midnight ISO (>= today 00:00 in caller TZ)
//   7d    → now − 7 days ISO (rolling window)
//   30d   → now − 30 days ISO (rolling window)
//
// `now` is injectable for deterministic tests. Return shape is `{ after }`
// (not a bare string) so adding `before` for the custom picker is a non-
// breaking extension.

import type { DatePreset } from "@/core/schemas/asset-list-filter"

export interface DateRange {
  after: string
}

export function datePresetToRange(
  preset: DatePreset,
  now: Date = new Date(),
): DateRange | null {
  if (preset === "all") return null
  if (preset === "today") {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { after: midnight.toISOString() }
  }
  const days = preset === "7d" ? 7 : 30
  const boundary = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return { after: boundary.toISOString() }
}
