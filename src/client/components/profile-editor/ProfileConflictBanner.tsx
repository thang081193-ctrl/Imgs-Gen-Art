// Session #31 — Preserve-edits-on-409 banner. DECISIONS §F.4 state
// machine (saved / conflict / overwrite-save / discard-with-confirm).
//
// Non-dismissible by design: the only legitimate resolutions are
// Overwrite & Save (through the main Save button) or Discard (via the
// button here, with native confirm). A dismiss-X would leave the UI
// in "edits kept but banner gone" state that re-triggers the same
// 409 on next save with no visual warning.

import type { ReactElement } from "react"

export interface ProfileConflictBannerProps {
  onDiscard: () => void
}

const DISCARD_CONFIRM = "Discard your unsaved edits? This cannot be undone."

export function ProfileConflictBanner({
  onDiscard,
}: ProfileConflictBannerProps): ReactElement {
  const handleDiscard = (): void => {
    if (window.confirm(DISCARD_CONFIRM)) onDiscard()
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start justify-between gap-3 rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      <div className="flex-1">
        <p className="font-medium">
          This profile was updated on the server.
        </p>
        <p className="text-xs text-amber-300/90">
          Your edits are preserved. Saving will overwrite the server's version.
        </p>
      </div>
      <button
        type="button"
        onClick={handleDiscard}
        className="shrink-0 rounded border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/30"
      >
        Discard my edits
      </button>
    </div>
  )
}
