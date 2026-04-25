// Phase D2 (Session #44) — Step 4 (run) UI for `<PolicyAwareWizard>`.
//
// Owns the Run/Cancel buttons + progress readout + the policy event
// banner that surfaces server-side runner-start enforcement (post-D1
// the runner re-checks; D2 wizard preflight is the fast UI signal).

import type { ReactElement } from "react"

import type { PolicyRunEvent, RunState } from "@/client/utils/use-workflow-run"

export interface RunStepProps {
  runState: RunState
  policyEvent: PolicyRunEvent | null
  total: number
  completedCount: number
  onStart: () => void
  onCancel: () => void
}

export function RunStep({
  runState,
  policyEvent,
  total,
  completedCount,
  onStart,
  onCancel,
}: RunStepProps): ReactElement {
  return (
    <div className="space-y-3" data-testid="wizard-run">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          disabled={runState === "running"}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          data-testid="wizard-run-start"
        >
          Run batch
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={runState !== "running"}
          className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
          data-testid="wizard-run-cancel"
        >
          Cancel
        </button>
        <span
          className="text-xs text-slate-400"
          data-testid="wizard-run-progress"
        >
          {completedCount} / {total} · {runState}
        </span>
      </div>
      {policyEvent !== null ? (
        <p
          className={
            policyEvent.type === "policy_blocked"
              ? "rounded border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-100"
              : "rounded border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-100"
          }
          data-testid="wizard-run-policy-banner"
          data-event-type={policyEvent.type}
        >
          {policyEvent.type === "policy_blocked"
            ? `Run blocked at preflight — ${policyEvent.decision.violations.length} violation(s) persisted to audit.`
            : `Warning surfaced at runner-start — ${policyEvent.decision.violations.length} violation(s) in decision.`}
        </p>
      ) : null}
    </div>
  )
}
