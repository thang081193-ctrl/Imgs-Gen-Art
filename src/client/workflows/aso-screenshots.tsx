// aso-screenshots form — mirrors src/workflows/aso-screenshots/input-schema.ts.
// `targetLangs` uses a chip-picker (1..3) per Q4 refine with model-aware
// grey-out: langs NOT in model.capability.supportedLanguages are disabled
// with a tooltip. On model switch, if any already-picked lang becomes
// unsupported, we auto-deselect + toast.
//
// CopyLangSchema = 10 langs: de,en,es,fr,it,ja,ko,pt,th,vi
// Mock/Gemini/Imagen lack `th` → chip greys out when those models picked.

import { useEffect, useRef, useState } from "react"
import type { ReactElement } from "react"
import type { WorkflowFormProps } from "./types"

const COPY_LANGS = ["en", "vi", "ja", "ko", "th", "es", "fr", "pt", "it", "de"] as const
type CopyLang = (typeof COPY_LANGS)[number]

const MAX_LANGS = 3

interface State {
  targetLangs: CopyLang[]
  conceptCount: number
  variantsPerConcept: number
  seed: string
}

function initial(): State {
  return {
    targetLangs: ["en"],
    conceptCount: 3,
    variantsPerConcept: 1,
    seed: "",
  }
}

function parseInput(s: State): { input: unknown | null; error?: string } {
  if (s.targetLangs.length === 0) return { input: null, error: "Pick at least 1 language" }
  if (s.targetLangs.length > MAX_LANGS) return { input: null, error: `Max ${MAX_LANGS} langs` }
  const seedTrim = s.seed.trim()
  let seed: number | undefined
  if (seedTrim) {
    const n = Number(seedTrim)
    if (!Number.isInteger(n)) return { input: null, error: "Seed must be an integer" }
    seed = n
  }
  return {
    input: {
      targetLangs: s.targetLangs,
      conceptCount: s.conceptCount,
      variantsPerConcept: s.variantsPerConcept,
      ...(seed !== undefined ? { seed } : {}),
    },
  }
}

export function AsoScreenshotsForm({
  model,
  showToast,
  onInputChange,
}: WorkflowFormProps): ReactElement {
  const [s, setS] = useState<State>(initial)
  const modelIdRef = useRef<string | null>(null)
  const supportedLangs = new Set<string>(model.capability.supportedLanguages)

  // Auto-deselect langs that become unsupported when user switches model.
  // Guard with modelIdRef so the initial mount doesn't toast.
  useEffect(() => {
    if (modelIdRef.current === null) {
      modelIdRef.current = model.id
      return
    }
    if (modelIdRef.current === model.id) return
    modelIdRef.current = model.id
    const kept = s.targetLangs.filter((l) => supportedLangs.has(l))
    const removed = s.targetLangs.filter((l) => !supportedLangs.has(l))
    if (removed.length > 0) {
      setS({ ...s, targetLangs: kept.length > 0 ? kept : ["en"] })
      showToast({
        variant: "warning",
        message: `Removed ${removed.join(", ")} — not supported by ${model.displayName}`,
      })
    }
  }, [model.id, model.displayName, s, showToast, supportedLangs])

  useEffect(() => {
    const { input, error } = parseInput(s)
    onInputChange(input, error)
  }, [s, onInputChange])

  const toggleLang = (l: CopyLang): void => {
    if (!supportedLangs.has(l)) return
    if (s.targetLangs.includes(l)) {
      setS({ ...s, targetLangs: s.targetLangs.filter((x) => x !== l) })
    } else if (s.targetLangs.length < MAX_LANGS) {
      setS({ ...s, targetLangs: [...s.targetLangs, l] })
    } else {
      showToast({ variant: "warning", message: `Max ${MAX_LANGS} langs` })
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-xs text-slate-400">Target languages (1–{MAX_LANGS})</div>
        <div className="flex flex-wrap gap-2">
          {COPY_LANGS.map((l) => {
            const picked = s.targetLangs.includes(l)
            const supported = supportedLangs.has(l)
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggleLang(l)}
                disabled={!supported}
                title={supported ? undefined : `Not supported by ${model.displayName}`}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  !supported
                    ? "border-slate-800 bg-slate-900 text-slate-600 cursor-not-allowed"
                    : picked
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-slate-700 bg-slate-900 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400"
                }`}
              >
                {l}
              </button>
            )
          })}
        </div>
      </div>
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
