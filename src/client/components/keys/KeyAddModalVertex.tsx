// Vertex "add key slot" form — multipart upload of GCP service-account JSON.
// Plain <input type="file"> (Q2 — accessibility + native picker > drop-zone LOC).
// Validates the SA file client-side against VertexServiceAccountSchema so bad
// JSON / wrong shape surfaces BEFORE the upload; server re-validates too.
// BONUS B: projectId auto-filled from parsed SA.project_id; user can override.

import { useState } from "react"
import type { ChangeEvent, FormEvent, ReactElement } from "react"
import { Modal } from "@/client/components/Modal"
import { createVertexKey } from "@/client/api/hooks"
import { ApiError } from "@/client/api/client"
import { VertexServiceAccountSchema } from "@/core/schemas"

export interface KeyAddModalVertexProps {
  open: boolean
  onClose: () => void
  onCreated: (slotId: string) => void
}

const DEFAULT_LOCATION = "us-central1"

export function KeyAddModalVertex({
  open,
  onClose,
  onCreated,
}: KeyAddModalVertexProps): ReactElement {
  const [label, setLabel] = useState("")
  const [projectId, setProjectId] = useState("")
  const [location, setLocation] = useState(DEFAULT_LOCATION)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [parsedClientEmail, setParsedClientEmail] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset(): void {
    setLabel("")
    setProjectId("")
    setLocation(DEFAULT_LOCATION)
    setFile(null)
    setFileError(null)
    setParsedClientEmail(null)
    setSubmitting(false)
    setError(null)
  }

  function close(): void {
    if (submitting) return
    reset()
    onClose()
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const picked = e.target.files?.[0] ?? null
    setFile(null)
    setFileError(null)
    setParsedClientEmail(null)
    if (picked === null) return

    try {
      const text = await picked.text()
      const json: unknown = JSON.parse(text)
      const result = VertexServiceAccountSchema.safeParse(json)
      if (!result.success) {
        const first = result.error.issues[0]
        setFileError(
          first ? `${first.path.join(".")}: ${first.message}` : "Invalid service account JSON",
        )
        return
      }
      setFile(picked)
      setParsedClientEmail(result.data.client_email)
      if (projectId.trim() === "") setProjectId(result.data.project_id)
    } catch (err) {
      setFileError(
        err instanceof Error ? `Cannot parse file: ${err.message}` : "Cannot parse file",
      )
    }
  }

  const canSubmit =
    !submitting &&
    file !== null &&
    label.trim() !== "" &&
    projectId.trim() !== "" &&
    location.trim() !== ""

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!canSubmit || file === null) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await createVertexKey({
        label: label.trim(),
        projectId: projectId.trim(),
        location: location.trim(),
        file,
      })
      reset()
      onCreated(res.slotId)
      onClose()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to add Vertex key"
      setError(msg)
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add Vertex service account" size="md">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="vertex-label" className="block text-sm font-medium text-slate-300 mb-1">
            Label
          </label>
          <input
            id="vertex-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. personal-vertex"
            className="input"
            autoComplete="off"
            maxLength={200}
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="vertex-file" className="block text-sm font-medium text-slate-300 mb-1">
            Service account JSON
          </label>
          <input
            id="vertex-file"
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            disabled={submitting}
            className="block w-full text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:text-slate-200 hover:file:bg-slate-700"
          />
          {fileError !== null && (
            <p className="mt-1 text-xs text-red-400">{fileError}</p>
          )}
          {parsedClientEmail !== null && fileError === null && (
            <p className="mt-1 text-xs text-emerald-400">
              Parsed OK — <span className="font-mono">{parsedClientEmail}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Stored under <code>keys/vertex-{"{"}slotId{"}"}.json</code>. File never leaves your machine.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="vertex-project" className="block text-sm font-medium text-slate-300 mb-1">
              Project ID
            </label>
            <input
              id="vertex-project"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input"
              autoComplete="off"
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="vertex-location" className="block text-sm font-medium text-slate-300 mb-1">
              Location
            </label>
            <input
              id="vertex-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input"
              autoComplete="off"
              disabled={submitting}
            />
          </div>
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
            disabled={!canSubmit}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Uploading…" : "Add slot"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
