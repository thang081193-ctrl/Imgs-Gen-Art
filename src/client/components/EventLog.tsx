// Scrollable event stream. Displays parsed WorkflowEvent objects with
// per-type color + short summary. Autoscrolls to the latest event when
// the user hasn't manually scrolled up. Max-height fixed; overflow-y.

import { useEffect, useRef } from "react"
import type { ReactElement } from "react"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"

export interface EventLogProps {
  events: WorkflowEvent[]
}

export function EventLog({ events }: EventLogProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [events.length])

  return (
    <div
      ref={ref}
      className="h-64 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1"
    >
      {events.length === 0 && (
        <div className="text-slate-600">No events yet — press Run to start.</div>
      )}
      {events.map((ev, i) => (
        <EventRow key={i} ev={ev} />
      ))}
    </div>
  )
}

function EventRow({ ev }: { ev: WorkflowEvent }): ReactElement {
  const color = colorFor(ev.type)
  const line = summarize(ev)
  return (
    <div className="flex gap-2">
      <span className={`${color} w-44 shrink-0`}>{ev.type}</span>
      <span className="text-slate-400 truncate">{line}</span>
    </div>
  )
}

function colorFor(type: WorkflowEvent["type"]): string {
  switch (type) {
    case "started":           return "text-sky-400"
    case "concept_generated": return "text-indigo-400"
    case "image_generated":   return "text-emerald-400"
    case "error":             return "text-red-400"
    case "aborted":           return "text-yellow-400"
    case "complete":          return "text-green-400"
  }
}

function summarize(ev: WorkflowEvent): string {
  switch (ev.type) {
    case "started":
      return `batchId=${ev.batchId} total=${ev.total}`
    case "concept_generated":
      return `#${ev.index} "${ev.concept.title}" seed=${ev.concept.seed}`
    case "image_generated":
      return `#${ev.index} asset=${ev.asset.id} ${ev.asset.width}×${ev.asset.height} ${ev.asset.status}`
    case "error": {
      const prefix = ev.index !== undefined ? `#${ev.index} ` : ""
      return `${prefix}${ev.context}: ${ev.error.message}`
    }
    case "aborted":
      return `${ev.completedCount}/${ev.totalCount} completed before cancel`
    case "complete":
      return `${ev.assets.length} asset(s) saved · batchId=${ev.batchId}`
  }
}
