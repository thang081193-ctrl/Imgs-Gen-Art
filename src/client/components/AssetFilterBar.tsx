// Gallery filter bar: profile dropdown + workflow chip toggles + batchId
// search. Single-selection per filter (the server `GET /api/assets` query
// accepts one profileId, one workflowId, one batchId — not arrays).
//
// batchId uses validate-on-blur (Q5 refine C): "Batch not found" surfaces
// when the result-set is 0, handled by parent via asset count.

import { useState } from "react"
import type { ReactElement } from "react"
import { COLOR_CLASSES } from "@/core/design"
import type { WorkflowId } from "@/core/design/types"
import type { ProfileSummaryDto } from "@/core/dto/profile-dto"
import type { WorkflowSummary } from "@/client/api/hooks"

export interface AssetFilterBarProps {
  profiles: ProfileSummaryDto[]
  workflows: WorkflowSummary[]
  profileId: string | null
  workflowId: WorkflowId | null
  batchId: string | null
  onProfileChange: (id: string | null) => void
  onWorkflowChange: (id: WorkflowId | null) => void
  onBatchIdChange: (id: string | null) => void
  batchNotFound?: boolean
}

export function AssetFilterBar({
  profiles,
  workflows,
  profileId,
  workflowId,
  batchId,
  onProfileChange,
  onWorkflowChange,
  onBatchIdChange,
  batchNotFound,
}: AssetFilterBarProps): ReactElement {
  const [batchDraft, setBatchDraft] = useState<string>(batchId ?? "")

  return (
    <div className="space-y-3 rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-xs text-slate-400 space-y-1">
          <span>Profile</span>
          <select
            value={profileId ?? ""}
            onChange={(e) => onProfileChange(e.target.value || null)}
            className="input"
          >
            <option value="">All profiles</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-400 space-y-1 md:col-span-2">
          <span>Batch ID (exact match)</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={batchDraft}
              onChange={(e) => setBatchDraft(e.target.value)}
              onBlur={() => {
                const v = batchDraft.trim()
                onBatchIdChange(v === "" ? null : v)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = batchDraft.trim()
                  onBatchIdChange(v === "" ? null : v)
                }
              }}
              placeholder="e.g. batch_xyz1234abc"
              className="input flex-1"
            />
            {batchId !== null && (
              <button
                type="button"
                onClick={() => {
                  setBatchDraft("")
                  onBatchIdChange(null)
                }}
                className="rounded-md bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
              >
                Clear
              </button>
            )}
          </div>
          {batchNotFound === true && (
            <p className="text-xs text-yellow-400">Batch not found — 0 assets.</p>
          )}
        </label>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-slate-400">Workflow</div>
        <div className="flex flex-wrap gap-2">
          <WorkflowChip
            label="All"
            active={workflowId === null}
            onClick={() => onWorkflowChange(null)}
          />
          {workflows.map((w) => {
            const active = workflowId === w.id
            const classes = COLOR_CLASSES[w.colorVariant]
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onWorkflowChange(active ? null : w.id)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active ? classes.badge : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                {w.displayName}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WorkflowChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-slate-500 bg-slate-700 text-slate-100"
          : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  )
}
