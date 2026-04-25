// Session #40 Phase B2 — text-overlay brainstorm picker modal.
//
// Inputs: optional headline + optional description. The hook returns a
// PromptAssistResult whose `prompt` is 5 newline-separated `[tone] text`
// lines (Q-40.E + fallback-overlay.ts contract). Modal renders 5 cards,
// each with [Copy] and [Use as prompt]. Selecting "Use as prompt" wraps
// the overlay text into `Generate an image with text overlay: "…"` and
// fires the parent callback so PromptLab prefills the editor.

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactElement } from "react"

import {
  parseOverlayLines,
  PromptAssistError,
  useTextOverlayBrainstorm,
} from "@/client/api/prompt-assist-hooks"

import { FromFallbackPill } from "./FromFallbackPill"

const TONE_PALETTE: Record<string, string> = {
  bold: "bg-rose-500/20 text-rose-200 border-rose-500/40",
  playful: "bg-sky-500/20 text-sky-200 border-sky-500/40",
  minimal: "bg-slate-500/20 text-slate-200 border-slate-500/40",
  urgency: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  "social-proof": "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  freeform: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
}

function toneClass(tone: string): string {
  return TONE_PALETTE[tone] ?? "bg-slate-500/20 text-slate-200 border-slate-500/40"
}

export interface OverlayPickerModalProps {
  open: boolean
  onClose: () => void
  onUsePrompt: (prompt: string) => void
  onTerminalError: (message: string) => void
}

export function OverlayPickerModal({
  open,
  onClose,
  onUsePrompt,
  onTerminalError,
}: OverlayPickerModalProps): ReactElement | null {
  const [headline, setHeadline] = useState("")
  const [description, setDescription] = useState("")
  const hook = useTextOverlayBrainstorm()

  const overlays = useMemo(
    () => (hook.result !== null ? parseOverlayLines(hook.result.prompt) : []),
    [hook.result],
  )

  useEffect(() => {
    if (!open) return undefined
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  const handleSubmit = useCallback(async (): Promise<void> => {
    try {
      await hook.submit({
        ...(headline.trim() ? { headline: headline.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      })
    } catch (err) {
      if (err instanceof PromptAssistError && err.kind !== "validation") {
        onTerminalError(err.message)
      }
    }
  }, [hook, headline, description, onTerminalError])

  const handleCopy = (text: string): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text)
    }
  }

  if (!open) return null

  const submitDisabled =
    hook.state === "submitting" || (!headline.trim() && !description.trim())

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="overlay-modal-backdrop"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">Text-overlay brainstorm</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Headline (e.g. Ship faster)"
            maxLength={200}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
            data-testid="overlay-headline-input"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description / context (optional)"
            rows={2}
            maxLength={1000}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitDisabled}
            className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {hook.state === "submitting" ? "Calling Grok…" : "Brainstorm 5 overlays"}
          </button>
        </div>

        {hook.state === "error" && hook.error?.kind === "validation" && (
          <p className="mt-3 text-xs text-red-400" role="alert">
            {hook.error.message}
          </p>
        )}

        {hook.result !== null && (
          <div className="mt-4 space-y-2">
            {hook.result.fromFallback === true && <FromFallbackPill />}
            <ul className="space-y-2" data-testid="overlay-list">
              {overlays.map((line, idx) => (
                <li
                  key={`${line.tone}-${idx}`}
                  data-testid={`overlay-card-${idx}`}
                  className="rounded-md border border-slate-700 bg-slate-950 p-2.5"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${toneClass(line.tone)}`}
                    >
                      {line.tone}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopy(line.text)}
                        className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onUsePrompt(`Generate an image with text overlay: "${line.text}"`)
                          onClose()
                        }}
                        className="rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-600"
                      >
                        Use as prompt
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-200">{line.text}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
