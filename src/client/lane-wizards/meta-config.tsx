// Phase D2 (Session #44) — Meta lane wizard config.
//
// Wires the existing `ad-production` runner (X-1 LOCKED — Meta = ad-
// production) into the generic `<PolicyAwareWizard>` chassis. Step 1
// captures profile + featureFocus + counts; Step 2 lets bro pick aspect
// ratio + locale. Steps 3 (preflight) + 4 (run) are owned by the
// chassis and reused across lanes.

import type { ReactElement } from "react"

import { ProfileSelector } from "@/client/components/ProfileSelector"
import type { LaneStepDefinition, LaneWizardConfig } from "./types"

const FEATURE_FOCUS = [
  { value: "restore",    label: "Restore" },
  { value: "enhance",    label: "Enhance" },
  { value: "ai_art",     label: "AI Art" },
  { value: "three_d",    label: "3D" },
  { value: "cartoon",    label: "Cartoon" },
  { value: "polaroid",   label: "Polaroid" },
  { value: "all_in_one", label: "All-in-one" },
] as const

const ASPECT_RATIOS = ["1:1", "4:5", "9:16"] as const
const LANGUAGES = ["en", "vi", "ja", "ko", "th", "es", "fr", "pt", "it", "de"] as const

export interface MetaWizardForm {
  profileId: string | null
  featureFocus: string
  conceptCount: number
  variantsPerConcept: number
  aspectRatio: (typeof ASPECT_RATIOS)[number]
  language: (typeof LANGUAGES)[number]
  seed: string
  // Phase D2 (Session #44) — index signature so the chassis's generic
  // constraint (`WizardFormState = Record<string, unknown>`) accepts
  // this concrete shape. All explicit members assign to `unknown`.
  [k: string]: unknown
}

function initialState(): MetaWizardForm {
  return {
    profileId: null,
    featureFocus: "restore",
    conceptCount: 4,
    variantsPerConcept: 1,
    aspectRatio: "1:1",
    language: "en",
    seed: "",
  }
}

const stepProfile: LaneStepDefinition<MetaWizardForm> = {
  id: "profile-and-focus",
  title: "Profile & focus",
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
        <label className="block text-xs text-slate-400 space-y-1">
          <span>Feature focus</span>
          <select
            value={formState.featureFocus}
            onChange={(e) =>
              setFormState({ ...formState, featureFocus: e.target.value })
            }
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            data-testid="meta-feature-focus"
          >
            {FEATURE_FOCUS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
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
              data-testid="meta-concept-count"
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
              data-testid="meta-variants"
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
              data-testid="meta-seed"
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

const stepFraming: LaneStepDefinition<MetaWizardForm> = {
  id: "framing",
  title: "Framing",
  render: (ctx): ReactElement => {
    const { formState, setFormState } = ctx
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
            data-testid="meta-aspect-ratio"
          >
            {ASPECT_RATIOS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-400 space-y-1">
          <span>Locale</span>
          <select
            value={formState.language}
            onChange={(e) =>
              setFormState({
                ...formState,
                language: e.target.value as (typeof LANGUAGES)[number],
              })
            }
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            data-testid="meta-language"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
    )
  },
}

export const metaConfig: LaneWizardConfig<MetaWizardForm> = {
  workflowId: "ad-production",
  platform: "meta",
  laneLabel: "Meta Ads",
  initialState,
  inputSteps: [stepProfile, stepFraming],
  buildPreflightInput: (s) => {
    // Q-44.G LOCKED — preflight surface is the concept-0 prompt + the
    // (h, s) overlays the runner will compose. The chassis can't run
    // the server's prompt-composer here, so we hand a minimal feature-
    // focus tag that the keyword + claim checkers can match against.
    // The server-side runner re-checks at batch start with the full
    // composed prompt → preflight is a fast UI signal, not the gate.
    return {
      platform: "meta",
      prompt: `Meta ad — featureFocus=${s.featureFocus}`,
      copyTexts: [],
      assetAspectRatio: s.aspectRatio,
    }
  },
  buildRunBody: (s, profileId) => {
    const seedTrim = s.seed.trim()
    const seed: number | undefined = seedTrim ? Number(seedTrim) : undefined
    return {
      profileId,
      providerId: "mock",
      modelId: "mock-fast",
      aspectRatio: s.aspectRatio,
      language: s.language,
      input: {
        featureFocus: s.featureFocus,
        conceptCount: s.conceptCount,
        variantsPerConcept: s.variantsPerConcept,
        ...(seed !== undefined && Number.isInteger(seed) ? { seed } : {}),
      },
    }
  },
}
