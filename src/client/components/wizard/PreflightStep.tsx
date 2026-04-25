// Phase D2 (Session #44) — Step 3 (preflight) UI for `<PolicyAwareWizard>`.
//
// Renders the preflight badge + violation list + "Resolve overrides"
// CTA. Pure presentation: parent owns the `usePolicyPreflight` handle
// and threads its state in. Lives in a sibling subdir so the chassis
// stays under the LOC hard cap (300).

import type { ReactElement } from "react"

import type {
  PolicyDecision,
  PolicyViolation,
} from "@/client/api/policy-rules-hooks"

export type PreflightStepState = "idle" | "submitting" | "done" | "error"

export interface PreflightStepProps {
  decision: PolicyDecision | null
  state: PreflightStepState
  error: Error | null
  blocking: PolicyViolation[]
  unresolvedWarnings: PolicyViolation[]
  onResolve: () => void
  onRecheck: () => void
}

export function PreflightStep({
  decision,
  state,
  error,
  blocking,
  unresolvedWarnings,
  onResolve,
  onRecheck,
}: PreflightStepProps): ReactElement {
  return (
    <div className="space-y-3" data-testid="wizard-preflight">
      <div className="flex items-center gap-2">
        <PreflightBadge
          state={state}
          blocking={blocking}
          unresolvedWarnings={unresolvedWarnings}
        />
        <button
          type="button"
          onClick={onRecheck}
          className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          data-testid="wizard-recheck"
        >
          Re-check
        </button>
      </div>
      {state === "error" ? (
        <p className="text-sm text-rose-300">
          Preflight failed: {error?.message ?? "unknown"}
        </p>
      ) : null}
      {decision !== null && decision.violations.length > 0 ? (
        <div className="space-y-2">
          <ul className="space-y-1 text-sm">
            {decision.violations.map((v, i) => (
              <li
                key={`${v.ruleId}-${i}`}
                data-severity={v.severity}
                className={
                  v.severity === "block"
                    ? "rounded border border-rose-900/60 bg-rose-950/40 px-2 py-1 text-rose-100"
                    : v.details?.["overridden"] === true
                      ? "rounded border border-emerald-900/60 bg-emerald-950/30 px-2 py-1 text-emerald-100"
                      : "rounded border border-amber-900/60 bg-amber-950/30 px-2 py-1 text-amber-100"
                }
              >
                <span className="font-mono text-xs opacity-70">{v.ruleId}</span>
                <span className="ml-2">{v.message}</span>
              </li>
            ))}
          </ul>
          {unresolvedWarnings.length > 0 ? (
            <button
              type="button"
              onClick={onResolve}
              className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500"
              data-testid="wizard-resolve-overrides"
            >
              Resolve overrides ({unresolvedWarnings.length})
            </button>
          ) : null}
        </div>
      ) : null}
      {decision !== null && decision.ok && unresolvedWarnings.length === 0 ? (
        <p className="text-sm text-emerald-300">
          Policy clear — proceed to Run.
        </p>
      ) : null}
    </div>
  )
}

interface PreflightBadgeProps {
  state: PreflightStepState
  blocking: PolicyViolation[]
  unresolvedWarnings: PolicyViolation[]
}

function PreflightBadge({
  state,
  blocking,
  unresolvedWarnings,
}: PreflightBadgeProps): ReactElement {
  if (state === "submitting") {
    return (
      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300" data-testid="wizard-preflight-badge" data-state="submitting">
        Checking policy…
      </span>
    )
  }
  if (state === "error") {
    return (
      <span className="rounded-full bg-rose-900/60 px-3 py-1 text-xs text-rose-100" data-testid="wizard-preflight-badge" data-state="error">
        Preflight error
      </span>
    )
  }
  if (blocking.length > 0) {
    return (
      <span className="rounded-full bg-rose-900/60 px-3 py-1 text-xs text-rose-100" data-testid="wizard-preflight-badge" data-state="blocked">
        Blocked ({blocking.length})
      </span>
    )
  }
  if (unresolvedWarnings.length > 0) {
    return (
      <span className="rounded-full bg-amber-900/60 px-3 py-1 text-xs text-amber-100" data-testid="wizard-preflight-badge" data-state="warned">
        Warning ({unresolvedWarnings.length})
      </span>
    )
  }
  if (state === "done") {
    return (
      <span className="rounded-full bg-emerald-900/60 px-3 py-1 text-xs text-emerald-100" data-testid="wizard-preflight-badge" data-state="ok">
        Policy clear
      </span>
    )
  }
  return (
    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400" data-testid="wizard-preflight-badge" data-state="idle">
      Idle
    </span>
  )
}
