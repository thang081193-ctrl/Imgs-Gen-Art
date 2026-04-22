// ad-production form — mirrors src/workflows/ad-production/input-schema.ts.
// `featureFocus` is the 7-value FeatureFocus enum (feature bucket that
// decides which ad-layout variants the seeded shuffle draws from).

import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import type { WorkflowFormProps } from "./types"

const FEATURE_FOCUS: { value: string; label: string }[] = [
  { value: "restore",    label: "Restore" },
  { value: "enhance",    label: "Enhance" },
  { value: "ai_art",     label: "AI Art" },
  { value: "three_d",    label: "3D" },
  { value: "cartoon",    label: "Cartoon" },
  { value: "polaroid",   label: "Polaroid" },
  { value: "all_in_one", label: "All-in-one" },
]

interface State {
  featureFocus: string
  conceptCount: number
  variantsPerConcept: number
  seed: string
}

function initial(): State {
  return {
    featureFocus: "restore",
    conceptCount: 4,
    variantsPerConcept: 1,
    seed: "",
  }
}

function parseInput(s: State): { input: unknown | null; error?: string } {
  const seedTrim = s.seed.trim()
  let seed: number | undefined
  if (seedTrim) {
    const n = Number(seedTrim)
    if (!Number.isInteger(n)) return { input: null, error: "Seed must be an integer" }
    seed = n
  }
  return {
    input: {
      featureFocus: s.featureFocus,
      conceptCount: s.conceptCount,
      variantsPerConcept: s.variantsPerConcept,
      ...(seed !== undefined ? { seed } : {}),
    },
  }
}

export function AdProductionForm({ onInputChange }: WorkflowFormProps): ReactElement {
  const [s, setS] = useState<State>(initial)

  useEffect(() => {
    const { input, error } = parseInput(s)
    onInputChange(input, error)
  }, [s, onInputChange])

  return (
    <div className="space-y-3">
      <label className="block text-xs text-slate-400 space-y-1">
        <span>Feature focus</span>
        <select
          value={s.featureFocus}
          onChange={(e) => setS({ ...s, featureFocus: e.target.value })}
          className="input"
        >
          {FEATURE_FOCUS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-xs text-slate-400 space-y-1">
          <span>Concepts</span>
          <input
            type="number" min={1} max={10} value={s.conceptCount}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isInteger(n) && n >= 1 && n <= 10) setS({ ...s, conceptCount: n })
            }}
            className="input"
          />
        </label>
        <label className="block text-xs text-slate-400 space-y-1">
          <span>Variants / concept</span>
          <input
            type="number" min={1} max={4} value={s.variantsPerConcept}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isInteger(n) && n >= 1 && n <= 4) setS({ ...s, variantsPerConcept: n })
            }}
            className="input"
          />
        </label>
        <label className="block text-xs text-slate-400 space-y-1">
          <span>Seed (optional)</span>
          <input
            type="text" value={s.seed}
            onChange={(e) => setS({ ...s, seed: e.target.value })}
            placeholder="e.g. 42"
            className="input"
          />
        </label>
      </div>
    </div>
  )
}
