// Batch progress bar + Cancel button. Shown only while a batch is in
// flight (Bonus E) — callers conditionally render. `completedCount` / `total`
// drive the bar; 0/0 pre-start shows an indeterminate pulse.

import type { ReactElement } from "react"
import type { ColorVariant } from "@/core/design/types"
import { COLOR_CLASSES } from "@/core/design"

export interface RunStatusBarProps {
  colorVariant: ColorVariant
  completedCount: number
  total: number
  onCancel: () => void
}

export function RunStatusBar({
  colorVariant,
  completedCount,
  total,
  onCancel,
}: RunStatusBarProps): ReactElement {
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0
  const glow = COLOR_CLASSES[colorVariant].glow
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Streaming events…</span>
          <span className="font-mono">{completedCount}/{total || "?"}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full ${glow} transition-all`}
            style={{ width: total > 0 ? `${pct}%` : "20%" }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-500"
      >
        Cancel
      </button>
    </div>
  )
}
