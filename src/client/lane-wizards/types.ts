// Phase D2 (Session #44) — generic lane-wizard config (X-4 LOCKED).
//
// `<PolicyAwareWizard>` is a single chassis driven by a per-lane config.
// D2 ships the Meta config; E adds google-config; F2 adds play-config.
// Chassis stays unchanged across phases — we ~40% LOC across the 3
// wizards by parameterizing the config rather than forking the shell.

import type { ReactElement } from "react"

import type { ProfileSummaryDto } from "@/core/dto/profile-dto"
import type { WorkflowId } from "@/core/design/types"
import type {
  PolicyOverride,
  PolicyPreflightInput,
} from "@/client/api/policy-rules-hooks"
import type { ShowToast } from "@/client/components/ToastHost"

/** Minimal "draft" the chassis carries between steps. Each lane shapes
 *  the keys it cares about (Meta wizard adds featureFocus +
 *  conceptCount; Google adds headlines + descriptions; Play adds
 *  screenshot count). The chassis treats it as opaque state. */
export type WizardFormState = Record<string, unknown>

export interface StepFieldsContext<S extends WizardFormState = WizardFormState> {
  formState: S
  setFormState: (next: S) => void
  profiles: ProfileSummaryDto[]
  profilesLoading: boolean
  profilesError: Error | null
  showToast: ShowToast
}

/** Each lane defines a renderer per step. Returning `null` skips the
 *  step entirely (e.g. when a workflow doesn't need a Step 2 review
 *  pass). */
export interface LaneStepDefinition<S extends WizardFormState = WizardFormState> {
  /** Stable id used as React key + a11y target. */
  id: string
  /** Display title shown in the step indicator. */
  title: string
  /** Renders the step body. */
  render: (ctx: StepFieldsContext<S>) => ReactElement
  /** Returns null when ready to advance; otherwise a user-facing reason
   *  to disable the Next button. */
  validate?: (formState: S) => string | null
}

export interface LaneWizardConfig<S extends WizardFormState = WizardFormState> {
  /** Server-side workflow id (e.g. "ad-production", "google-ads",
   *  "aso-screenshots"). */
  workflowId: WorkflowId
  /** Policy platform — feeds buildPreflightInput.platform + the route
   *  the chassis hits via usePolicyPreflight. */
  platform: "meta" | "google-ads" | "play"
  /** UI label (e.g. "Meta Ads"). */
  laneLabel: string
  /** Initial form state. */
  initialState: () => S
  /** Step list (Step 1 inputs, Step 2 review, Step 3 preflight, Step 4
   *  run). Steps 3 + 4 are owned by the chassis; lanes return Steps 1 +
   *  2 only. */
  inputSteps: readonly LaneStepDefinition<S>[]
  /** Build the policy-rules preflight payload from the form. The
   *  chassis appends `overrides` per-call, so don't include them
   *  here. */
  buildPreflightInput: (formState: S) => Omit<PolicyPreflightInput, "overrides">
  /** Build the workflow-run body. The chassis splices in the
   *  resolved `policyOverrides` at start-time. */
  buildRunBody: (formState: S, profileId: string) => RunBodyDraft
}

export interface RunBodyDraft {
  profileId: string
  providerId: string
  modelId: string
  aspectRatio: string
  language?: string
  input: unknown
  policyOverrides?: PolicyOverride[]
}
