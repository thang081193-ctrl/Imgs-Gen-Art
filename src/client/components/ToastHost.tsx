// Global toast stack. Lives at <App /> root so any page can show a transient
// message. Intentionally non-context (prop-drill via `ShowToast` type) —
// Phase 3 has 3 pages; context would be overkill and harder to type-narrow
// when `showToast` is undefined during SSR-style unit tests.
//
// Toasts auto-dismiss after DURATION_MS; click-dismiss supported; optional
// CTA link renders as a button (used by "View in Gallery →" on cancel).

import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import { COLOR_CLASSES, type ColorVariant } from "@/core/design"

const DURATION_MS = 6000

export type ToastVariant = "info" | "success" | "warning" | "danger"

export interface ToastCTA {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  variant?: ToastVariant
  cta?: ToastCTA
}

export interface ToastInput {
  message: string
  variant?: ToastVariant
  cta?: ToastCTA
}

export type ShowToast = (toast: ToastInput) => void

export function useToastStack(): {
  toasts: Toast[]
  show: ShowToast
  dismiss: (id: string) => void
} {
  const [toasts, setToasts] = useState<Toast[]>([])
  const show: ShowToast = (input) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [
      ...prev,
      {
        id,
        message: input.message,
        ...(input.variant ? { variant: input.variant } : {}),
        ...(input.cta ? { cta: input.cta } : {}),
      },
    ])
  }
  const dismiss = (id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }
  return { toasts, show, dismiss }
}

const VARIANT_COLOR: Record<ToastVariant, ColorVariant> = {
  info: "sky",
  success: "green",
  warning: "yellow",
  danger: "red",
}

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}): ReactElement {
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: () => void
}): ReactElement {
  const variant: ToastVariant = toast.variant ?? "info"
  const color = VARIANT_COLOR[variant]
  const badgeClass = COLOR_CLASSES[color].badge

  useEffect(() => {
    const h = setTimeout(onDismiss, DURATION_MS)
    return () => clearTimeout(h)
  }, [onDismiss])

  return (
    <div
      className={`pointer-events-auto rounded-md border px-4 py-3 shadow-lg ${badgeClass} min-w-[260px] max-w-[420px]`}
    >
      <div className="flex items-start gap-3">
        <p className="text-sm flex-1">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-slate-400 hover:text-slate-200"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {toast.cta !== undefined && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              toast.cta?.onClick()
              onDismiss()
            }}
            className="text-sm font-medium underline hover:no-underline"
          >
            {toast.cta.label}
          </button>
        </div>
      )}
    </div>
  )
}
