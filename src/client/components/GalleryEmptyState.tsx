// Phase 5 Step 3b (Session #29) — rendered when an active filter returns zero
// assets. The active-constraint summary lives in the AssetFilterChips row
// above this block (no duplicate rendering), so this component keeps to the
// message + a "Clear all filters" call-to-action. No "Try loosening one"
// heuristic in v1 — that would require per-dimension probe queries which
// we deferred (carry-forward #14 territory).

import type { ReactElement } from "react"

export interface GalleryEmptyStateProps {
  onClearAll: () => void
}

export function GalleryEmptyState({ onClearAll }: GalleryEmptyStateProps): ReactElement {
  return (
    <div className="rounded-md border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-400 space-y-3">
      <p>No assets match the current filters.</p>
      <button
        type="button"
        onClick={onClearAll}
        className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-200 hover:border-slate-500 hover:text-slate-100"
      >
        Clear all filters
      </button>
    </div>
  )
}
