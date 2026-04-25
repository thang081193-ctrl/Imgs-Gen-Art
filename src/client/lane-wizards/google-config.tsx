// Phase E (Session #44) — Google Ads lane wizard config.
//
// Reuses the D2 PolicyAwareWizard chassis (X-4 LOCKED). Step 1 picks
// profile + featureFocus; Step 2 sets headline + description counts.
// Steps 3 (preflight) + 4 (run) are owned by the chassis.

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

export interface GoogleAdsWizardForm {
  profileId: string | null
  featureFocus: string
  headlineCount: number
  descriptionCount: number
  seed: string
  [k: string]: unknown
}

function initialState(): GoogleAdsWizardForm {
  return {
    profileId: null,
    featureFocus: "restore",
    headlineCount: 5,
    descriptionCount: 3,
    seed: "",
  }
}

const stepProfile: LaneStepDefinition<GoogleAdsWizardForm> = {
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
            data-testid="google-feature-focus"
          >
            {FEATURE_FOCUS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </label>
      </div>
    )
  },
  validate: (s): string | null => {
    if (!s.profileId) return "Pick a profile to continue."
    return null
  },
}

const stepCounts: LaneStepDefinition<GoogleAdsWizardForm> = {
  id: "counts",
  title: "Ad shape",
  render: (ctx): ReactElement => {
    const { formState, setFormState } = ctx
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-xs text-slate-400 space-y-1">
            <span>Headlines</span>
            <input
              type="number" min={1} max={15}
              value={formState.headlineCount}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isInteger(n) && n >= 1 && n <= 15) {
                  setFormState({ ...formState, headlineCount: n })
                }
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              data-testid="google-headline-count"
            />
          </label>
          <label className="block text-xs text-slate-400 space-y-1">
            <span>Descriptions</span>
            <input
              type="number" min={1} max={4}
              value={formState.descriptionCount}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isInteger(n) && n >= 1 && n <= 4) {
                  setFormState({ ...formState, descriptionCount: n })
                }
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              data-testid="google-description-count"
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
              data-testid="google-seed"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Each batch produces one Responsive Search Ad set (
          {formState.headlineCount} headlines × {formState.descriptionCount}{" "}
          descriptions).
        </p>
      </div>
    )
  },
}

export const googleConfig: LaneWizardConfig<GoogleAdsWizardForm> = {
  workflowId: "google-ads",
  platform: "google-ads",
  laneLabel: "Google Ads",
  initialState,
  inputSteps: [stepProfile, stepCounts],
  buildPreflightInput: (s) => ({
    platform: "google-ads",
    prompt: `Google Responsive Search Ad — featureFocus=${s.featureFocus}`,
    copyTexts: [],
  }),
  buildRunBody: (s, profileId) => {
    const seedTrim = s.seed.trim()
    const seed: number | undefined = seedTrim ? Number(seedTrim) : undefined
    return {
      profileId,
      providerId: "mock",
      modelId: "mock-fast",
      aspectRatio: "1:1",
      input: {
        featureFocus: s.featureFocus,
        headlineCount: s.headlineCount,
        descriptionCount: s.descriptionCount,
        ...(seed !== undefined && Number.isInteger(seed) ? { seed } : {}),
      },
    }
  },
}
