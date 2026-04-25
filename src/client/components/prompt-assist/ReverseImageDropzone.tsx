// Session #40 Phase B2 — drag/drop + click-to-upload dropzone for the
// reverse-from-image use case. Plain HTML5 (no react-dropzone dep).
// Validates MIME (png/jpeg/webp/gif) and size (5 MB) client-side; surfaces
// inline errors local to the dropzone (Q-40.F + Q-40.G — no toast). On
// success, exposes a "Use this prompt" button that fires the parent
// callback so PromptLab can prefill the editor.

import { useCallback, useRef, useState } from "react"
import type { ChangeEvent, DragEvent, ReactElement } from "react"

import {
  isAllowedImageMime,
  MAX_IMAGE_BYTES,
  PromptAssistError,
  useReverseFromImage,
  type PromptAssistLane,
} from "@/client/api/prompt-assist-hooks"

import { FromFallbackPill } from "./FromFallbackPill"

export interface ReverseImageDropzoneProps {
  lane?: PromptAssistLane
  platform?: string
  onUsePrompt: (prompt: string) => void
  onTerminalError: (message: string) => void
}

export function ReverseImageDropzone({
  lane,
  platform,
  onUsePrompt,
  onTerminalError,
}: ReverseImageDropzoneProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [picked, setPicked] = useState<File | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const hook = useReverseFromImage()

  const validateAndSet = (file: File): void => {
    if (!isAllowedImageMime(file.type)) {
      setLocalError(`Unsupported image type: ${file.type || "unknown"}.`)
      setPicked(null)
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setLocalError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`)
      setPicked(null)
      return
    }
    setLocalError(null)
    setPicked(file)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    if (f) validateAndSet(f)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) validateAndSet(f)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (): void => setDragOver(false)

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!picked) return
    try {
      await hook.submit({
        image: picked,
        ...(lane !== undefined ? { lane } : {}),
        ...(platform !== undefined ? { platform } : {}),
      })
    } catch (err) {
      if (err instanceof PromptAssistError && err.kind !== "validation") {
        onTerminalError(err.message)
      }
    }
  }, [picked, hook, lane, platform, onTerminalError])

  const handleReset = (): void => {
    setPicked(null)
    setLocalError(null)
    hook.reset()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="space-y-3" data-testid="reverse-dropzone">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click()
        }}
        className={`cursor-pointer rounded-md border-2 border-dashed p-4 text-center text-xs transition-colors ${
          dragOver
            ? "border-sky-500 bg-sky-950/30 text-sky-200"
            : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-600"
        }`}
      >
        {picked ? (
          <div className="space-y-1">
            <p className="font-medium text-slate-200">{picked.name}</p>
            <p className="text-[11px] text-slate-500">
              {(picked.size / 1024).toFixed(1)} KB · {picked.type}
            </p>
          </div>
        ) : (
          <p>
            Drop an image, or <span className="text-sky-300 underline">click to browse</span>
            <br />
            <span className="text-[11px] text-slate-500">PNG / JPEG / WebP / GIF · max 5 MB</span>
          </p>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleFileChange}
        className="hidden"
        data-testid="reverse-file-input"
      />

      {localError !== null && (
        <p className="text-xs text-red-400" role="alert">
          {localError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!picked || hook.state === "submitting"}
          className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {hook.state === "submitting" ? "Calling Grok…" : "Reverse-engineer"}
        </button>
        {(picked || hook.result || hook.error) && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
          >
            Reset
          </button>
        )}
      </div>

      {hook.state === "error" && hook.error?.kind === "validation" && (
        <p className="text-xs text-red-400" role="alert">
          {hook.error.message}
        </p>
      )}

      {hook.state === "done" && hook.result !== null && (
        <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900 p-3">
          {hook.result.fromFallback === true && <FromFallbackPill />}
          <p className="whitespace-pre-wrap text-xs text-slate-200">{hook.result.prompt}</p>
          <button
            type="button"
            onClick={() => onUsePrompt(hook.result!.prompt)}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
          >
            Use this prompt
          </button>
        </div>
      )}
    </div>
  )
}
