// Session #40 Phase B2 — idea-to-prompt input form. Textarea (3-2000
// chars) + lane select + optional platform input. Wizard-shape props
// (Q-40.J): caller passes `lane` from Step 1; if absent, the user picks
// it from a default list.

import { useCallback, useState } from "react"
import type { ReactElement } from "react"

import {
  PromptAssistError,
  useIdeaToPrompt,
  type PromptAssistLane,
} from "@/client/api/prompt-assist-hooks"

import { FromFallbackPill } from "./FromFallbackPill"

const LANE_OPTIONS: ReadonlyArray<{ value: PromptAssistLane; label: string }> = [
  { value: "ads.meta", label: "Meta Ads" },
  { value: "ads.google-ads", label: "Google Ads" },
  { value: "aso.play", label: "Play Store ASO" },
  { value: "artwork-batch", label: "Generic Artwork" },
]

export interface IdeaInputFormProps {
  lane?: PromptAssistLane
  platform?: string
  onUsePrompt: (prompt: string) => void
  onTerminalError: (message: string) => void
}

export function IdeaInputForm({
  lane: laneProp,
  platform: platformProp,
  onUsePrompt,
  onTerminalError,
}: IdeaInputFormProps): ReactElement {
  const [idea, setIdea] = useState("")
  const [lane, setLane] = useState<PromptAssistLane>(laneProp ?? "ads.meta")
  const [platform, setPlatform] = useState<string>(platformProp ?? "")
  const hook = useIdeaToPrompt()

  const trimmed = idea.trim()
  const tooShort = trimmed.length < 3
  const tooLong = trimmed.length > 2000

  const handleSubmit = useCallback(async (): Promise<void> => {
    try {
      await hook.submit({
        idea: trimmed,
        lane,
        ...(platform.trim() ? { platform: platform.trim() } : {}),
      })
    } catch (err) {
      if (err instanceof PromptAssistError && err.kind !== "validation") {
        onTerminalError(err.message)
      }
    }
  }, [hook, trimmed, lane, platform, onTerminalError])

  const handleReset = (): void => {
    setIdea("")
    hook.reset()
  }

  const submitDisabled = tooShort || tooLong || hook.state === "submitting"

  return (
    <div className="space-y-3" data-testid="idea-form">
      <label className="block text-xs text-slate-400">
        Lane
        <select
          value={lane}
          onChange={(e) => setLane(e.target.value as PromptAssistLane)}
          disabled={laneProp !== undefined}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-60"
          data-testid="idea-lane-select"
        >
          {LANE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-slate-400">
        Platform <span className="text-slate-600">(optional)</span>
        <input
          type="text"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="e.g. feed, story, reels"
          maxLength={64}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
        />
      </label>

      <label className="block text-xs text-slate-400">
        Idea
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Briefly describe the campaign or concept…"
          rows={4}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
          data-testid="idea-textarea"
        />
        <span className="mt-0.5 block text-[11px] text-slate-500">
          {trimmed.length} / 2000 chars
        </span>
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitDisabled}
          className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {hook.state === "submitting" ? "Calling Grok…" : "Expand to prompt"}
        </button>
        {(idea.length > 0 || hook.result || hook.error) && (
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
