// Provider + Model pickers + live compatibility hint. Reads:
//   - `providers` / `models` from /api/providers
//   - compat matrix from /api/providers/compatibility
// The compat badge below the dropdowns tells the user when their picked
// pair is INCOMPATIBLE for the currently-selected workflow (source=override
// gets a distinct note).

import type { ReactElement } from "react"
import type { ModelInfo, ProviderInfo } from "@/core/model-registry/types"
import type { CompatibilityMatrix } from "@/core/compatibility/types"
import type { WorkflowId } from "@/core/design/types"
import { lookupCompat } from "@/client/api/hooks"

export interface ProviderModelSelectorProps {
  providers: ProviderInfo[]
  models: ModelInfo[]
  providerId: string | null
  modelId: string | null
  workflowId: WorkflowId | null
  matrix: CompatibilityMatrix | null
  onProviderChange: (id: string) => void
  onModelChange: (id: string) => void
}

export function ProviderModelSelector({
  providers,
  models,
  providerId,
  modelId,
  workflowId,
  matrix,
  onProviderChange,
  onModelChange,
}: ProviderModelSelectorProps): ReactElement {
  const modelsForProvider = providerId === null
    ? []
    : models.filter((m) => m.providerId === providerId)

  const compat = workflowId !== null && providerId !== null && modelId !== null
    ? lookupCompat(matrix, workflowId, providerId, modelId)
    : null

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={providerId ?? ""}
          onChange={(e) => onProviderChange(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
        >
          <option value="" disabled>Provider…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.displayName}</option>
          ))}
        </select>
        <select
          value={modelId ?? ""}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={modelsForProvider.length === 0}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
        >
          <option value="" disabled>Model…</option>
          {modelsForProvider.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName} — ${m.costPerImageUsd.toFixed(3)}/img
            </option>
          ))}
        </select>
      </div>
      {compat !== null && (
        <CompatBadge
          status={compat.status}
          source={compat.source}
          {...(compat.reason !== undefined ? { reason: compat.reason } : {})}
          recommended={compat.recommendedForWorkflow === true}
        />
      )}
    </div>
  )
}

function CompatBadge({
  status,
  source,
  reason,
  recommended,
}: {
  status: "compatible" | "incompatible"
  source: "declarative" | "override"
  reason?: string
  recommended: boolean
}): ReactElement {
  if (status === "incompatible") {
    return (
      <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
        <strong>Incompatible</strong>
        {reason !== undefined && <> — {reason}</>}
      </div>
    )
  }
  const overrideNote = source === "override" ? " (override)" : ""
  const recommendedNote = recommended ? " · recommended" : ""
  return (
    <div className="rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
      <strong>Compatible</strong>{overrideNote}{recommendedNote}
      {reason !== undefined && source === "override" && <> — {reason}</>}
    </div>
  )
}
