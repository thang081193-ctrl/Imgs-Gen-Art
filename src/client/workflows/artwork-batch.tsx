// artwork-batch form — input shape mirrors
// src/workflows/artwork-batch/input-schema.ts (strict). `group` is one of
// 8 ArtworkGroupKeys; `seed` is optional number. Validates in-render so
// the Run button enables/disables live.

import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import type { WorkflowFormProps } from "./types"

const GROUPS: { value: string; label: string }[] = [
  { value: "memory",   label: "Memory" },
  { value: "cartoon",  label: "Cartoon" },
  { value: "aiArt",    label: "AI Art" },
  { value: "festive",  label: "Festive" },
  { value: "xmas",     label: "Xmas" },
  { value: "baby",     label: "Baby" },
  { value: "avatar",   label: "Avatar" },
  { value: "allInOne", label: "All-in-one" },
]

interface State {
  group: string
  subjectDescription: string
  conceptCount: number
  variantsPerConcept: number
  seed: string  // raw text; parsed on validate
}

function initial(): State {
  return {
    group: "memory",
    subjectDescription: "",
    conceptCount: 4,
    variantsPerConcept: 1,
    seed: "",
  }
}

function parseInput(s: State): { input: unknown | null; error?: string } {
  if (!s.subjectDescription.trim()) return { input: null, error: "Subject required" }
  if (s.subjectDescription.length > 500) return { input: null, error: "Subject too long (max 500)" }
  const seedTrim = s.seed.trim()
  let seed: number | undefined
  if (seedTrim) {
    const n = Number(seedTrim)
    if (!Number.isInteger(n)) return { input: null, error: "Seed must be an integer" }
    seed = n
  }
  return {
    input: {
      group: s.group,
      subjectDescription: s.subjectDescription.trim(),
      conceptCount: s.conceptCount,
      variantsPerConcept: s.variantsPerConcept,
      ...(seed !== undefined ? { seed } : {}),
    },
  }
}

export function ArtworkBatchForm({ onInputChange }: WorkflowFormProps): ReactElement {
  const [s, setS] = useState<State>(initial)

  useEffect(() => {
    const { input, error } = parseInput(s)
    onInputChange(input, error)
  }, [s, onInputChange])

  return (
    <div className="space-y-3">
      <Field label="Group">
        <select
          value={s.group}
          onChange={(e) => setS({ ...s, group: e.target.value })}
          className="input"
        >
          {GROUPS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Subject description">
        <input
          type="text"
          value={s.subjectDescription}
          onChange={(e) => setS({ ...s, subjectDescription: e.target.value })}
          placeholder="e.g. a smiling golden retriever on a beach"
          className="input"
          maxLength={500}
        />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Concepts" min={1} max={10} value={s.conceptCount}
          onChange={(v) => setS({ ...s, conceptCount: v })} />
        <NumberField label="Variants / concept" min={1} max={8} value={s.variantsPerConcept}
          onChange={(v) => setS({ ...s, variantsPerConcept: v })} />
        <Field label="Seed (optional)">
          <input
            type="text"
            value={s.seed}
            onChange={(e) => setS({ ...s, seed: e.target.value })}
            placeholder="e.g. 42"
            className="input"
          />
        </Field>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="block text-xs text-slate-400 space-y-1">
      <span>{label}</span>
      {children}
    </label>
  )
}

function NumberField({
  label, min, max, value, onChange,
}: {
  label: string; min: number; max: number; value: number; onChange: (v: number) => void
}): ReactElement {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= min && n <= max) onChange(n)
        }}
        className="input"
      />
    </Field>
  )
}
