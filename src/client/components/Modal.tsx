// Generic modal primitive — backdrop + ESC dismiss + first-element
// focus trap + ARIA role. Holds any form content (Session #20 KeyAddModal
// consumes it; Phase 5 replay / profile editor will too).
//
// Focus trap is intentionally lightweight: on open, focus the first
// tabbable element; Tab/Shift+Tab cycle within the dialog. Covers the
// 95% case without pulling in a focus-trap lib.
//
// ConfirmDialog (Session #16) stays as-is — its API is narrow (text body +
// 2 buttons) and already works; refactoring it to compose Modal is
// orthogonal and out of scope for Session #20.

import { useEffect, useRef } from "react"
import type { ReactElement, ReactNode } from "react"

export type ModalSize = "sm" | "md" | "lg"

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: ModalSize
  /** Hides the default "✕" close button when false (e.g. forced-choice dialogs). Default true. */
  showCloseButton?: boolean
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
}

const TABBABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  showCloseButton = true,
}: ModalProps): ReactElement | null {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  // Stash onClose in a ref so the keydown effect does NOT re-subscribe on
  // every parent render (parents typically recreate their `close` handler
  // closure each render — if that went into deps, the effect would re-run
  // on every keystroke and `firstTabbable.focus()` would steal focus from
  // whichever input the user is typing into).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Initial autofocus: ONLY when open transitions false → true. Not part of
  // the keydown effect so re-renders during typing don't re-focus.
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (dialog === null) return
    const firstTabbable = dialog.querySelector<HTMLElement>(TABBABLE_SELECTOR)
    firstTabbable?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const dialog = dialogRef.current
    if (dialog === null) return undefined

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab") return
      const tabbables = Array.from(
        dialog.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"))
      if (tabbables.length === 0) return
      const first = tabbables[0] as HTMLElement
      const last = tabbables[tabbables.length - 1] as HTMLElement
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => onCloseRef.current()}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`w-full rounded-lg border border-slate-700 bg-slate-900 shadow-xl ${SIZE_CLASS[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-100">
            {title}
          </h2>
          {showCloseButton && (
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="text-slate-400 hover:text-slate-200 text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
