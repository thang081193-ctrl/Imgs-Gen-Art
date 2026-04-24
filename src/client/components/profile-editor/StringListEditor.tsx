// Session #30 Step 4 (Q-30.G) — shared chip-based multi-string editor.
// Consumers: visual.doList, visual.dontList, positioning.competitors,
// context.features, context.keyScenarios, context.forbiddenContent.
//
// Pure helpers (`normalizeItem`, `tryAddItem`, `shouldCommitOnKey`) are
// exported for unit tests — jsdom is still deferred (handoff carry-forward
// #5) so we exercise behavior by calling these reducer-shaped functions
// directly instead of mounting the component.

import { useState } from "react"
import type { KeyboardEvent, ReactElement } from "react"

export type DelimiterMode = "comma" | "enter" | "both"
export type NormalizeMode = "trim" | "trimLowercase" | "none"

export interface StringListEditorProps {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  maxItems?: number
  maxItemLength?: number
  delimiter?: DelimiterMode
  allowDuplicates?: boolean
  normalize?: NormalizeMode
  label?: string
  helpText?: string
  errorText?: string
  disabled?: boolean
}

export interface AddOptions {
  current: string[]
  raw: string
  maxItems?: number
  maxItemLength?: number
  allowDuplicates?: boolean
  normalize?: NormalizeMode
}

export type AddRejection = "empty" | "too_long" | "duplicate" | "too_many"
export type AddResult =
  | { ok: true; next: string[]; added: string }
  | { ok: false; reason: AddRejection }

export function normalizeItem(
  raw: string,
  mode: NormalizeMode = "trim",
): string | null {
  if (raw.trim() === "") return null
  if (mode === "none") return raw
  const trimmed = raw.trim().replace(/\s+/g, " ")
  return mode === "trimLowercase" ? trimmed.toLowerCase() : trimmed
}

export function tryAddItem(opts: AddOptions): AddResult {
  const normalized = normalizeItem(opts.raw, opts.normalize ?? "trim")
  if (normalized === null) return { ok: false, reason: "empty" }
  if (opts.maxItemLength !== undefined && normalized.length > opts.maxItemLength) {
    return { ok: false, reason: "too_long" }
  }
  if (!(opts.allowDuplicates ?? false) && opts.current.includes(normalized)) {
    return { ok: false, reason: "duplicate" }
  }
  if (opts.maxItems !== undefined && opts.current.length >= opts.maxItems) {
    return { ok: false, reason: "too_many" }
  }
  return { ok: true, next: [...opts.current, normalized], added: normalized }
}

export function shouldCommitOnKey(
  key: string,
  delimiter: DelimiterMode,
  draftNonEmpty: boolean,
): boolean {
  if (key === "Enter") return delimiter === "enter" || delimiter === "both"
  if (key === ",") return delimiter === "comma" || delimiter === "both"
  if (key === "Tab") return draftNonEmpty
  return false
}

export function StringListEditor({
  value,
  onChange,
  placeholder,
  maxItems,
  maxItemLength,
  delimiter = "both",
  allowDuplicates = false,
  normalize = "trim",
  label,
  helpText,
  errorText,
  disabled,
}: StringListEditorProps): ReactElement {
  const [draft, setDraft] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  const attempt = (raw: string): boolean => {
    const result = tryAddItem({
      current: value,
      raw,
      ...(maxItems !== undefined ? { maxItems } : {}),
      ...(maxItemLength !== undefined ? { maxItemLength } : {}),
      allowDuplicates,
      normalize,
    })
    if (!result.ok) {
      setLocalError(
        describeReason(result.reason, {
          ...(maxItems !== undefined ? { maxItems } : {}),
          ...(maxItemLength !== undefined ? { maxItemLength } : {}),
        }),
      )
      return false
    }
    onChange(result.next)
    setLocalError(null)
    return true
  }

  const removeAt = (index: number): void => {
    onChange(value.filter((_, i) => i !== index))
    setLocalError(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (disabled) return
    if (shouldCommitOnKey(e.key, delimiter, draft.trim() !== "")) {
      e.preventDefault()
      if (attempt(draft)) setDraft("")
      return
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault()
      removeAt(value.length - 1)
    }
  }

  const atCapacity = maxItems !== undefined && value.length >= maxItems
  const shownError = errorText ?? localError

  return (
    <div className="space-y-1">
      {label !== undefined && (
        <label className="text-xs text-slate-400">{label}</label>
      )}
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-2 ${
          disabled
            ? "border-slate-800 bg-slate-900/50 opacity-70"
            : "border-slate-700 bg-slate-900"
        }`}
      >
        {value.map((item, idx) => (
          <span
            key={`${idx}-${item}`}
            className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 pl-2 text-xs text-slate-200"
          >
            <span className="max-w-[240px] truncate">{item}</span>
            <button
              type="button"
              onClick={() => removeAt(idx)}
              disabled={disabled}
              className="px-2 py-0.5 text-slate-500 hover:text-slate-100 disabled:hover:text-slate-500"
              aria-label={`Remove ${item}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim() !== "" && attempt(draft)) setDraft("")
          }}
          disabled={disabled || atCapacity}
          placeholder={
            atCapacity ? "" : placeholder ?? placeholderDefault(delimiter)
          }
          className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-100 focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      {shownError !== null && shownError !== undefined && (
        <p className="text-xs text-red-400">{shownError}</p>
      )}
      {(shownError === null || shownError === undefined) &&
        helpText !== undefined && (
          <p className="text-xs text-slate-500">{helpText}</p>
        )}
    </div>
  )
}

function placeholderDefault(delimiter: DelimiterMode): string {
  if (delimiter === "comma") return "Add item — comma to commit"
  if (delimiter === "enter") return "Add item — Enter to commit"
  return "Add item — Enter / comma"
}

function describeReason(
  reason: AddRejection,
  bounds: { maxItems?: number; maxItemLength?: number },
): string {
  if (reason === "empty") return "Please enter a value."
  if (reason === "too_long") return `Too long (max ${bounds.maxItemLength} chars).`
  if (reason === "too_many") return `Limit reached (max ${bounds.maxItems}).`
  return "Already in the list."
}
