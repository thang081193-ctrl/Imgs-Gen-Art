// Phase 5 Step 5b (Session #27b) — PromptLab middle column.
//
// Owns the editable prompt + addWatermark checkbox + (capability-gated)
// negativePrompt field. Run button fires `onRun(override)` with the
// populated OverridePayload — parent (PromptLab page) wires it to useReplay.
// Run button disabled when prompt unchanged from source OR when a replay is
// already in flight.
//
// Negative prompt visibility: hidden universally in v1 per Session #27b
// Q5b.1 alignment because all real providers register
// supportsNegativePrompt: false. We keep the code path alive for the mock
// model (supportsNegativePrompt: true) + future adapters — when a model
// reports true, the field appears. DECISIONS.md captures the v1 carve-out.
//
// Reset returns the editor to the source asset's values without running.

import { useEffect, useState } from "react"
import type { ReactElement } from "react"

import type { AssetDto } from "@/core/dto/asset-dto"
import type { ModelInfo } from "@/core/model-registry/types"
import type { OverridePayload } from "@/core/schemas/override-payload"

export interface PromptEditorState {
  prompt: string
  addWatermark: boolean
  negativePrompt: string
}

export interface PromptEditorProps {
  source: AssetDto
  model: ModelInfo | null
  running: boolean
  onStateChange: (state: PromptEditorState) => void
  onRun: (override: OverridePayload) => void
  onCancel: () => void
  onReset: () => void
}

export function PromptEditor({
  source,
  model,
  running,
  onStateChange,
  onRun,
  onCancel,
  onReset,
}: PromptEditorProps): ReactElement {
  const [prompt, setPrompt] = useState<string>(source.promptRaw)
  // v1: addWatermark default false on editor open (source asset doesn't
  // expose the flag directly — replayPayload carries it but we don't want
  // to fetch + parse payload client-side). Checkbox starts unchecked.
  const [addWatermark, setAddWatermark] = useState<boolean>(false)
  const [negativePrompt, setNegativePrompt] = useState<string>("")

  // Reset when source changes (PromptLab navigates to a different asset).
  useEffect(() => {
    setPrompt(source.promptRaw)
    setAddWatermark(false)
    setNegativePrompt("")
  }, [source.id, source.promptRaw])

  useEffect(() => {
    onStateChange({ prompt, addWatermark, negativePrompt })
  }, [prompt, addWatermark, negativePrompt, onStateChange])

  const promptChanged = prompt !== source.promptRaw
  const wmChanged = addWatermark !== false
  const npChanged = negativePrompt !== ""
  const anyChange = promptChanged || wmChanged || npChanged
  const supportsNegativePrompt = model?.capability.supportsNegativePrompt ?? false

  const handleRun = (): void => {
    if (!anyChange || running) return
    const override: OverridePayload = {
      ...(promptChanged ? { prompt } : {}),
      ...(wmChanged ? { addWatermark } : {}),
      ...(supportsNegativePrompt && npChanged
        ? { negativePrompt }
        : {}),
    }
    onRun(override)
  }

  const handleReset = (): void => {
    setPrompt(source.promptRaw)
    setAddWatermark(false)
    setNegativePrompt("")
    onReset()
  }

  return (
    <section className="space-y-4" aria-label="Prompt editor">
      <div>
        <label
          htmlFor="prompt-lab-prompt"
          className="block text-xs uppercase tracking-wide text-slate-500 mb-1.5"
        >
          Prompt
        </label>
        <textarea
          id="prompt-lab-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          disabled={running}
          className="w-full rounded-md border border-slate-800 bg-slate-950 p-3 text-sm text-slate-100 font-mono leading-relaxed placeholder:text-slate-600 focus:border-sky-600 focus:outline-none disabled:opacity-50"
          placeholder="Edit the prompt and click Run edit to regenerate."
        />
        <p className="mt-1 text-[11px] text-slate-500">
          {prompt.length} chars · {promptChanged ? "edited" : "unchanged"}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wide text-slate-500 mb-1">
          Overrides
        </legend>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={addWatermark}
            onChange={(e) => setAddWatermark(e.target.checked)}
            disabled={running}
            className="h-4 w-4 rounded border-slate-700 bg-slate-900"
          />
          <span>
            Add watermark
            {addWatermark && (
              <span className="ml-1 text-amber-400 text-[11px]">
                · marks replay class not_replayable
              </span>
            )}
          </span>
        </label>
        {supportsNegativePrompt && (
          <label className="block">
            <span className="text-xs text-slate-400">Negative prompt</span>
            <input
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              disabled={running}
              maxLength={2000}
              placeholder="e.g. no text, no humans"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 p-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none disabled:opacity-50"
            />
          </label>
        )}
      </fieldset>

      <div className="flex items-center gap-2 pt-1">
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={!anyChange}
              onClick={handleRun}
              className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Run edit
            </button>
            <button
              type="button"
              disabled={!anyChange}
              onClick={handleReset}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          </>
        )}
      </div>
    </section>
  )
}
