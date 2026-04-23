// Prominent red banner shown on the Workflow page when the picked
// (workflow, provider:model) triple is incompatible. Complements the
// Run-button disable state with a visible reason so the user knows why.
//
// Server CompatibilityResult.reason is the source of truth; fallback copy
// covers the rare undefined branch (stale client vs. new server shape).
//
// See PLAN §7 — Compatibility Matrix. Paired with CompatBadge (positive
// affirmation only) in ProviderModelSelector after Session #22.

import type { ReactElement } from "react"

export const COMPAT_FALLBACK_REASON =
  "This provider and model combination is not compatible with the selected workflow."

export function getBannerMessage(reason: string | undefined): string {
  const trimmed = reason?.trim()
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : COMPAT_FALLBACK_REASON
}

export interface CompatibilityWarningProps {
  reason: string | undefined
}

export function CompatibilityWarning({ reason }: CompatibilityWarningProps): ReactElement {
  const message = getBannerMessage(reason)
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-red-500/50 bg-red-500/10 p-4"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-lg leading-none text-red-400">
          ⛔
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-red-300">Incompatible combination</p>
          <p className="text-sm text-red-400/90">{message}</p>
        </div>
      </div>
    </div>
  )
}
