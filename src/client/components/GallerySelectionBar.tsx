// Session #34 F1b — contextual selection action bar for the Gallery.
// Replaces the regular `<h1>Gallery</h1>` header whenever `pickedCount > 0`,
// Google-Photos style. Owns no state; Gallery passes the count, page-
// selection flag + callbacks.

import type { ReactElement } from "react"

export interface GallerySelectionBarProps {
  pickedCount: number
  allOnPageSelected: boolean
  deleting: boolean
  onClear: () => void
  onToggleSelectPage: () => void
  onDelete: () => void
}

export function GallerySelectionBar({
  pickedCount,
  allOnPageSelected,
  deleting,
  onClear,
  onToggleSelectPage,
  onDelete,
}: GallerySelectionBarProps): ReactElement {
  return (
    <header className="flex items-center justify-between gap-3 rounded-md border border-sky-600/50 bg-sky-900/30 px-3 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="rounded-md bg-slate-800 px-2 py-1 text-sm text-slate-200 hover:bg-slate-700"
        >
          ✕
        </button>
        <span className="text-sm font-medium text-slate-100">
          {pickedCount} selected
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSelectPage}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
        >
          {allOnPageSelected ? "Unselect page" : "Select all on page"}
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={onDelete}
          className="rounded-md border border-red-800/70 bg-red-900/60 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </header>
  )
}
