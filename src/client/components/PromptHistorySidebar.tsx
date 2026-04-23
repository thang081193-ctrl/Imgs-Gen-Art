// Phase 5 Step 5b (Session #27b) — prior-edit list for PromptLab.
//
// V1 surface: flat list, createdAt DESC. Click an entry → parent prefills
// the editor with that iteration's prompt (non-destructive — current buffer
// is replaced). Tree view via parentHistoryId deferred to polish per
// Session #27b Q-5b.2 alignment.
//
// Status chips use the taxonomy from prompt_history.status. Failed /
// cancelled rows stay visible so the user can still read the prompt text
// that produced the failure.

import type { ReactElement } from "react"

import type {
  PromptHistoryDto,
  PromptHistoryStatus,
} from "@/core/dto/prompt-history-dto"
import { formatCost } from "@/client/utils/format"

export interface PromptHistorySidebarProps {
  history: PromptHistoryDto[]
  loading: boolean
  error: Error | null
  onPick: (entry: PromptHistoryDto) => void
}

export function PromptHistorySidebar({
  history,
  loading,
  error,
  onPick,
}: PromptHistorySidebarProps): ReactElement {
  return (
    <aside
      className="space-y-2"
      aria-label="Prior prompt iterations"
    >
      <h3 className="text-xs uppercase tracking-wide text-slate-500">
        History
      </h3>
      {loading && <p className="text-xs text-slate-500">Loading…</p>}
      {error !== null && (
        <p className="text-xs text-red-400">
          Failed to load history: {error.message}
        </p>
      )}
      {!loading && error === null && history.length === 0 && (
        <p className="text-xs text-slate-500 italic">
          No edits yet. Your first run will appear here.
        </p>
      )}
      <ul className="space-y-1.5">
        {history.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onPick(entry)}
              className="w-full text-left rounded-md border border-slate-800 bg-slate-900/40 p-2 hover:border-slate-700 hover:bg-slate-900/80"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-slate-500 truncate">
                  {entry.id}
                </span>
                <StatusChip status={entry.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-200">
                {entry.promptRaw}
              </p>
              <p className="mt-1 text-[10px] text-slate-500 flex items-center gap-2">
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
                {entry.costUsd !== null && (
                  <span className="font-mono">
                    {formatCost(entry.costUsd)}
                  </span>
                )}
                {renderOverrideBadges(entry)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function renderOverrideBadges(entry: PromptHistoryDto): ReactElement | null {
  const badges: string[] = []
  if (entry.overrideParams.addWatermark === true) badges.push("+wm")
  if (entry.overrideParams.negativePrompt) badges.push("+np")
  if (badges.length === 0) return null
  return (
    <span className="text-[10px] text-amber-400/80">· {badges.join(" ")}</span>
  )
}

function StatusChip({ status }: { status: PromptHistoryStatus }): ReactElement {
  const palette: Record<PromptHistoryStatus, string> = {
    complete: "bg-emerald-900/40 text-emerald-300",
    pending: "bg-sky-900/40 text-sky-300",
    failed: "bg-rose-900/40 text-rose-300",
    cancelled: "bg-slate-800 text-slate-400",
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${palette[status]}`}
    >
      {status}
    </span>
  )
}
