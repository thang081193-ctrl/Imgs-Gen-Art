// Phase 5 Step 5b (Session #27b) — inline diff view for PromptLab.
// Consumes diff-words.ts ops and renders word-level highlights. Unchanged
// text flows naturally; inserted text gets <ins> with a leading `+` marker
// + green styling; deleted text gets <del> with a leading `−` (U+2212 minus)
// + red strikethrough. aria-labels carry the op kind so screen readers
// announce edits.

import type { ReactElement } from "react"
import { diffWords, type DiffPart } from "@/client/utils/diff-words"

export interface DiffViewerProps {
  before: string
  after: string
}

export function DiffViewer({ before, after }: DiffViewerProps): ReactElement {
  const parts = diffWords(before, after)
  if (parts.every((p) => p.op === "equal")) {
    return (
      <p className="whitespace-pre-wrap text-sm text-slate-400 italic">
        No changes yet.
      </p>
    )
  }
  return (
    <p
      className="whitespace-pre-wrap break-words text-sm text-slate-200 leading-relaxed"
      aria-label="Prompt diff: additions in green, deletions in red"
    >
      {parts.map((part, idx) => (
        <DiffSpan key={`${idx}-${part.op}`} part={part} />
      ))}
    </p>
  )
}

function DiffSpan({ part }: { part: DiffPart }): ReactElement {
  if (part.op === "equal") {
    return <span>{part.text}</span>
  }
  if (part.op === "insert") {
    return (
      <ins
        aria-label={`Added: ${part.text}`}
        className="bg-emerald-900/40 text-emerald-300 no-underline rounded px-0.5"
      >
        <span aria-hidden="true" className="mr-0.5 font-mono text-[0.7em]">
          +
        </span>
        {part.text}
      </ins>
    )
  }
  return (
    <del
      aria-label={`Removed: ${part.text}`}
      className="bg-rose-900/40 text-rose-300 line-through decoration-rose-500 rounded px-0.5"
    >
      <span aria-hidden="true" className="mr-0.5 font-mono text-[0.7em]">
        −
      </span>
      {part.text}
    </del>
  )
}
