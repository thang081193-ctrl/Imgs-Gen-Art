// Phase C3 (Session #43) — PolicyOverrideDialog (standalone, NOT mounted).
//
// Q-43.H LOCKED: ships as a standalone component + unit test only. The
// D1+ Meta wizard (S#44) mounts it on a real preflight call site. Until
// then it lives unreferenced — keeping the wizard surface free of stub
// branches.
//
// Renders one textarea per `severity:"warning"` violation; cancel
// returns `null`, confirm returns the assembled `PolicyOverride[]`.
// `severity:"block"` violations are listed read-only with a "blocked"
// badge so bro can see them but cannot wave them through (Q-43.D).

import { useEffect, useMemo, useState } from "react"
import type { ReactElement } from "react"

import type {
  PolicyOverride,
  PolicyViolation,
} from "@/client/api/policy-rules-hooks"

export interface PolicyOverrideDialogProps {
  open: boolean
  violations: PolicyViolation[]
  /** Optional decidedBy stamp (e.g. profile id). Falls back to undefined. */
  decidedBy?: string
  onConfirm: (overrides: PolicyOverride[]) => void
  onCancel: () => void
}

export function PolicyOverrideDialog({
  open,
  violations,
  decidedBy,
  onConfirm,
  onCancel,
}: PolicyOverrideDialogProps): ReactElement | null {
  // Group violations by ruleId so multi-match keyword/claim-regex rules
  // surface as a single textarea (one reason covers all matches of the
  // same rule). Block rules are kept separate for the read-only list.
  const { warnings, blocks } = useMemo(() => {
    const w = new Map<string, PolicyViolation>()
    const b: PolicyViolation[] = []
    for (const v of violations) {
      if (v.severity === "block") {
        b.push(v)
        continue
      }
      if (!w.has(v.ruleId)) w.set(v.ruleId, v)
    }
    return { warnings: [...w.values()], blocks: b }
  }, [violations])

  const [reasons, setReasons] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) setReasons({})
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onCancel])

  if (!open) return null

  const allFilled = warnings.every(
    (w) => (reasons[w.ruleId] ?? "").trim().length > 0,
  )
  const canConfirm = warnings.length === 0 || allFilled

  const handleConfirm = (): void => {
    const decidedAt = new Date().toISOString()
    const overrides: PolicyOverride[] = warnings.map((w) => {
      const o: PolicyOverride = {
        ruleId: w.ruleId,
        reason: (reasons[w.ruleId] ?? "").trim(),
        decidedAt,
      }
      if (decidedBy !== undefined) o.decidedBy = decidedBy
      return o
    })
    onConfirm(overrides)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
      data-testid="policy-override-dialog"
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-100">
          Policy violations
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Provide a reason for each warning to proceed. Blocking
          violations cannot be overridden — edit input first.
        </p>

        {blocks.length > 0 ? (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium text-rose-300">
              Blocking ({blocks.length})
            </h3>
            <ul className="space-y-1">
              {blocks.map((v, i) => (
                <li
                  key={`${v.ruleId}-${i}`}
                  className="rounded border border-rose-900/60 bg-rose-950/40 px-2 py-1 text-xs text-rose-100"
                  data-testid="policy-override-block-row"
                >
                  <span className="font-mono text-rose-300">{v.ruleId}</span>
                  <span className="ml-2">{v.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-medium text-amber-300">
              Warnings ({warnings.length}) — provide reason to proceed
            </h3>
            {warnings.map((v) => (
              <label
                key={v.ruleId}
                className="block rounded border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-sm"
              >
                <div className="text-amber-200">
                  <span className="font-mono text-xs">{v.ruleId}</span>
                  <span className="ml-2 text-amber-100">{v.message}</span>
                </div>
                <textarea
                  data-testid={`policy-override-reason-${v.ruleId}`}
                  className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                  rows={2}
                  value={reasons[v.ruleId] ?? ""}
                  onChange={(e) =>
                    setReasons((prev) => ({ ...prev, [v.ruleId]: e.target.value }))
                  }
                  placeholder="Vì sao bro proceed bất chấp warning này?"
                />
              </label>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || blocks.length > 0}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Proceed with overrides
          </button>
        </div>
      </div>
    </div>
  )
}
