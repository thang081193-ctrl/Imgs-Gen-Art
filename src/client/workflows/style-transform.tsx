// style-transform form — mirrors src/workflows/style-transform/input-schema.ts.
// `sourceImageAssetId` is extracted from the profile's screenshotUrls via
// the /api/profile-assets/{id}/file URL shape (toProfileDto mapper).
//
// Q3 refine (Session #16): empty-state shows an actionable CTA linking to
// the Profile Manager (Phase 5 will wire the real upload). Don't block
// the form from rendering — users can still fill other fields and we
// surface the missing-source error via `onInputChange(null, error)` which
// disables the parent's Run button.

import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import type { WorkflowFormProps } from "./types"

const STYLES: { value: string; label: string }[] = [
  { value: "ANIME",  label: "Anime" },
  { value: "GHIBLI", label: "Ghibli" },
  { value: "PIXAR",  label: "Pixar" },
]

function extractAssetId(url: string): string | null {
  const m = /^\/api\/profile-assets\/([^/]+)\/file$/.exec(url)
  return m?.[1] ?? null
}

interface State {
  sourceImageAssetId: string
  styleDnaKey: string
  conceptCount: number
  variantsPerConcept: number
  seed: string
}

function initial(): State {
  return {
    sourceImageAssetId: "",
    styleDnaKey: "ANIME",
    conceptCount: 3,
    variantsPerConcept: 1,
    seed: "",
  }
}

function parseInput(s: State): { input: unknown | null; error?: string } {
  if (!s.sourceImageAssetId) return { input: null, error: "Pick a source screenshot" }
  const seedTrim = s.seed.trim()
  let seed: number | undefined
  if (seedTrim) {
    const n = Number(seedTrim)
    if (!Number.isInteger(n)) return { input: null, error: "Seed must be an integer" }
    seed = n
  }
  return {
    input: {
      sourceImageAssetId: s.sourceImageAssetId,
      styleDnaKey: s.styleDnaKey,
      conceptCount: s.conceptCount,
      variantsPerConcept: s.variantsPerConcept,
      ...(seed !== undefined ? { seed } : {}),
    },
  }
}

export function StyleTransformForm({
  profile,
  onInputChange,
}: WorkflowFormProps): ReactElement {
  const [s, setS] = useState<State>(initial)

  useEffect(() => {
    const { input, error } = parseInput(s)
    onInputChange(input, error)
  }, [s, onInputChange])

  const screenshots = profile?.assets.screenshotUrls ?? []
  const screenshotOptions = screenshots
    .map((url) => ({ url, id: extractAssetId(url) }))
    .filter((o): o is { url: string; id: string } => o.id !== null)

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-xs text-slate-400">Source screenshot</div>
        {screenshotOptions.length === 0 ? (
          <EmptyScreenshotState profileName={profile?.name ?? "this profile"} />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {screenshotOptions.map((opt) => {
              const active = s.sourceImageAssetId === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setS({ ...s, sourceImageAssetId: opt.id })}
                  className={`rounded-md border overflow-hidden aspect-[9/16] ${
                    active ? "border-pink-500 ring-2 ring-pink-500/40" : "border-slate-700 hover:border-pink-500/50"
                  }`}
                >
                  <img src={opt.url} alt="screenshot" className="w-full h-full object-cover" />
                </button>
              )
            })}
          </div>
        )}
      </div>
      <label className="block text-xs text-slate-400 space-y-1">
        <span>Style</span>
        <select
          value={s.styleDnaKey}
          onChange={(e) => setS({ ...s, styleDnaKey: e.target.value })}
          className="input"
        >
          {STYLES.map((st) => (
            <option key={st.value} value={st.value}>{st.label}</option>
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

function EmptyScreenshotState({ profileName }: { profileName: string }): ReactElement {
  return (
    <div className="rounded-md border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm space-y-2">
      <p className="text-slate-400">No screenshots uploaded for <strong>{profileName}</strong>.</p>
      <p className="text-xs text-slate-500">
        Upload screenshots in the Profile Manager (Phase 5) to enable style transforms.
      </p>
    </div>
  )
}
