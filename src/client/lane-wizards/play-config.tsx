// Phase F2 (Session #44) — Play ASO lane wizard config (Q-48.A LOCKED).
//
// Drives the existing aso-screenshots runner (X-1, F1 wired the policy
// preflight). Step 1 picks profile + concept count + variants. Step 2
// captures aspect ratio + targetLangs. Steps 3 (preflight) + 4 (run)
// are owned by the chassis.

import type { ReactElement } from "react"

import { ProfileSelector } from "@/client/components/ProfileSelector"
import type { LaneStepDefinition, LaneWizardConfig } from "./types"

const ASPECT_RATIOS = ["9:16", "16:9"] as const

const COPY_LANGS = ["en", "vi", "ja", "ko", "th", "es", "fr", "pt", "it", "de"] as const

export interface PlayWizardForm {
  profileId: string | null
  conceptCount: number
  variantsPerConcept: number
  aspectRatio: (typeof ASPECT_RATIOS)[number]
  targetLangs: string[]
  seed: string
  [k: string]: unknown
}

function initialState(): PlayWizardForm {
  return {
    profileId: null,
    conceptCount: 2,
    variantsPerConcept: 1,
    aspectRatio: "9:16",
    targetLangs: ["en"],
    seed: "",
  }
}

const stepProfile: LaneStepDefinition<PlayWizardForm> = {
  id: "profile-and-counts",
  title: "Profile & counts",
  render: (ctx): ReactElement => {
    const { formState, setFormState, profiles, profilesLoading, profilesError } = ctx
    return (
      <div className="space-y-4">
        <label className="block text-xs text-slate-400 space-y-1">
          <span>App profile</span>
          <ProfileSelector
            profiles={profiles}
            value={formState.profileId}
            onChange={(id) => setFormState({ ...formState, profileId: id })}
            loading={profilesLoading}
            {...(profilesError !== null ? { error: profilesError } : {})}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-xs text-slate-400 space-y-1">
            <span>Concepts</span>
            <input
              type="number" min={1} max={10}
              value={formState.conceptCount}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isInteger(n) && n >= 1 && n <= 10) {
                  setFormState({ ...formState, conceptCount: n })
                }
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              data-testid="play-concept-count"
            />
          </label>
          <label className="block text-xs text-slate-400 space-y-1">
            <span>Variants / concept</span>
            <input
              type="number" min={1} max={4}
              value={formState.variantsPerConcept}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isInteger(n) && n >= 1 && n <= 4) {
                  setFormState({ ...formState, variantsPerConcept: n })
                }
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              data-testid="play-variants"
            />
          </label>
          <label className="block text-xs text-slate-400 space-y-1">
            <span>Seed (optional)</span>
            <input
              type="text"
              value={formState.seed}
              onChange={(e) =>
                setFormState({ ...formState, seed: e.target.value })
              }
              placeholder="e.g. 42"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              data-testid="play-seed"
            />
          </label>
        </div>
      </div>
    )
  },
  validate: (s): string | null => {
    if (!s.profileId) return "Pick a profile to continue."
    return null
  },
}

const stepFraming: LaneStepDefinition<PlayWizardForm> = {
  id: "framing",
  title: "Framing & locales",
  render: (ctx): ReactElement => {
    // Step renderers are plain functions (called inside the chassis's
    // JSX), not components — hooks would land in the chassis's hook
    // stack and mismatch on step changes. Pure derivations only.
    const { formState, setFormState } = ctx
    const langs = formState.targetLangs
    const toggleLang = (lang: string): void => {
      const set = new Set(langs)
      if (set.has(lang)) set.delete(lang)
      else if (set.size < 3) set.add(lang) // S#15 Q3 cap
      setFormState({ ...formState, targetLangs: [...set] })
    }
    return (
      <div className="space-y-4">
        <label className="block text-xs text-slate-400 space-y-1">
          <span>Aspect ratio</span>
          <select
            value={formState.aspectRatio}
            onChange={(e) =>
              setFormState({
                ...formState,
                aspectRatio: e.target.value as (typeof ASPECT_RATIOS)[number],
              })
            }
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            data-testid="play-aspect-ratio"
          >
            {ASPECT_RATIOS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-1 text-xs text-slate-400">
          <legend>Target languages (max 3)</legend>
          <div className="flex flex-wrap gap-2 pt-1" data-testid="play-target-langs">
            {COPY_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggleLang(l)}
                className={
                  langs.includes(l)
                    ? "rounded-full bg-emerald-600/30 px-3 py-1 text-emerald-100"
                    : "rounded-full bg-slate-800 px-3 py-1 text-slate-400 hover:bg-slate-700"
                }
                data-testid={`play-lang-${l}`}
                data-selected={langs.includes(l) ? "true" : "false"}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 pt-1">
            Selected: {langs.join(", ") || "(none)"}
          </p>
        </fieldset>
      </div>
    )
  },
  validate: (s): string | null => {
    if (s.targetLangs.length === 0) return "Pick at least one target language."
    return null
  },
}

export const playConfig: LaneWizardConfig<PlayWizardForm> = {
  workflowId: "aso-screenshots",
  platform: "play",
  laneLabel: "Play ASO",
  initialState,
  inputSteps: [stepProfile, stepFraming],
  buildPreflightInput: (s) => ({
    platform: "play",
    prompt: `Play Store screenshot — ${s.conceptCount} concept(s) × ${s.targetLangs.length} lang(s)`,
    copyTexts: [],
    assetAspectRatio: s.aspectRatio,
  }),
  buildRunBody: (s, profileId) => {
    const seedTrim = s.seed.trim()
    const seed: number | undefined = seedTrim ? Number(seedTrim) : undefined
    return {
      profileId,
      providerId: "mock",
      modelId: "mock-fast",
      aspectRatio: s.aspectRatio,
      input: {
        conceptCount: s.conceptCount,
        variantsPerConcept: s.variantsPerConcept,
        targetLangs: s.targetLangs,
        ...(seed !== undefined && Number.isInteger(seed) ? { seed } : {}),
      },
    }
  },
}
