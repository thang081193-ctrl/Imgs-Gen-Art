// 4-card picker. Each card is themed by workflow's colorVariant token.
// Clicking switches the parent's selected workflowId; inactive cards use
// the `inactive` variant, active card uses `active` gradient.

import type { ReactElement } from "react"
import { COLOR_CLASSES } from "@/core/design"
import type { WorkflowId } from "@/core/design/types"
import type { WorkflowSummary } from "@/client/api/hooks"

export interface WorkflowPickerProps {
  workflows: WorkflowSummary[]
  selected: WorkflowId | null
  onSelect: (id: WorkflowId) => void
}

export function WorkflowPicker({
  workflows,
  selected,
  onSelect,
}: WorkflowPickerProps): ReactElement {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {workflows.map((wf) => {
        const classes = COLOR_CLASSES[wf.colorVariant]
        const active = selected === wf.id
        return (
          <button
            key={wf.id}
            type="button"
            onClick={() => onSelect(wf.id)}
            className={`rounded-lg border p-4 text-left transition-all ${
              active ? classes.active : classes.inactive
            }`}
          >
            <div className="text-sm font-semibold">{wf.displayName}</div>
            <div className={`text-xs mt-1 ${active ? "text-white/80" : "text-slate-500"}`}>
              {wf.description}
            </div>
          </button>
        )
      })}
    </div>
  )
}
