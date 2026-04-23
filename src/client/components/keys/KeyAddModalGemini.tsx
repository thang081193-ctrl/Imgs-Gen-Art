// Gemini "add key slot" form inside Modal primitive.
// Bonus D: type="password" + autoComplete="new-password" + show/hide toggle.
// Single text input for the API key; label required; submits via createGeminiKey.
// onSuccess fires with the new slotId so parent can trigger refresh + optional
// auto-activate flow (Session #20 UX leaves activate as a second click).

import { useState } from "react"
import type { FormEvent, ReactElement } from "react"
import { Modal } from "@/client/components/Modal"
import { createGeminiKey } from "@/client/api/hooks"
import { ApiError } from "@/client/api/client"

export interface KeyAddModalGeminiProps {
  open: boolean
  onClose: () => void
  onCreated: (slotId: string) => void
}

export function KeyAddModalGemini({
  open,
  onClose,
  onCreated,
}: KeyAddModalGeminiProps): ReactElement {
  const [label, setLabel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset(): void {
    setLabel("")
    setApiKey("")
    setShowKey(false)
    setSubmitting(false)
    setError(null)
  }

  function close(): void {
    if (submitting) return
    reset()
    onClose()
  }

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (submitting) return
    if (label.trim() === "" || apiKey.trim() === "") {
      setError("Label and API key are both required.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await createGeminiKey({ label: label.trim(), key: apiKey.trim() })
      reset()
      onCreated(res.slotId)
      onClose()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to add Gemini key"
      setError(msg)
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add Gemini API key" size="md">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="gemini-label" className="block text-sm font-medium text-slate-300 mb-1">
            Label
          </label>
          <input
            id="gemini-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. personal-dev"
            className="input w-full"
            autoComplete="off"
            maxLength={200}
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="gemini-key" className="block text-sm font-medium text-slate-300 mb-1">
            API key
          </label>
          <div className="flex gap-2">
            <input
              id="gemini-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="input flex-1"
              autoComplete="new-password"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="rounded-md bg-slate-800 px-3 text-sm text-slate-200 hover:bg-slate-700"
              disabled={submitting}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Stored encrypted at rest under <code>keys/keys.enc</code>. Never shown back in plaintext after save.
          </p>
        </div>

        {error !== null && (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || label.trim() === "" || apiKey.trim() === ""}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Adding…" : "Add slot"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
