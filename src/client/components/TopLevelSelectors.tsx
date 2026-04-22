// Top-level per-run params: aspectRatio + language. Both must fall within
// the selected model's capability (precondition #5 / #6). Options are
// scoped to the model's supported sets; if no model picked yet, dropdowns
// render disabled.

import type { ReactElement } from "react"
import type { AspectRatio, LanguageCode, ModelInfo } from "@/core/model-registry/types"

export interface TopLevelSelectorsProps {
  model: ModelInfo | null
  aspectRatio: AspectRatio | null
  language: LanguageCode | null
  onAspectRatioChange: (v: AspectRatio) => void
  onLanguageChange: (v: LanguageCode | null) => void
}

export function TopLevelSelectors({
  model,
  aspectRatio,
  language,
  onAspectRatioChange,
  onLanguageChange,
}: TopLevelSelectorsProps): ReactElement {
  const aspectOptions: readonly AspectRatio[] = model?.capability.supportedAspectRatios ?? []
  const langOptions: readonly LanguageCode[] = model?.capability.supportedLanguages ?? []

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-slate-400 space-y-1">
        <span>Aspect ratio</span>
        <select
          value={aspectRatio ?? ""}
          onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
          disabled={model === null}
          className="block w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
        >
          <option value="" disabled>Select…</option>
          {aspectOptions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-400 space-y-1">
        <span>Language <span className="text-slate-600">(optional)</span></span>
        <select
          value={language ?? ""}
          onChange={(e) => {
            const v = e.target.value
            onLanguageChange(v === "" ? null : (v as LanguageCode))
          }}
          disabled={model === null}
          className="block w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
        >
          <option value="">—</option>
          {langOptions.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
