// Phase D1 (Session #44) — per-platform PolicyCheckInput mappers.
//
// Single mapper file with one helper per workflow lane (Meta / Google /
// Play, X-1 LOCKED). Each helper packages the runner's preflight inputs
// (composed prompt + visible copy) into the shape `checkPolicy()`
// consumes. Pure: no IO, no clock — runner owns the orchestration.
//
// D1 ships `buildMetaCheckInput`. Phases E (Google Ads) and F1 (Play
// ASO) un-stub their helpers when they wire in. Calling a stub before
// its phase ships throws — keeps the single-file invariant from leaking
// into runtime via half-implemented helpers.

import type { AppProfile } from "@/core/schemas/app-profile"
import type { AspectRatio } from "@/core/model-registry/types"
import type { PolicyCheckInput } from "./checkers"

export interface BuildMetaCheckInputArgs {
  profile: AppProfile
  /** Composed concept-0 prompt — runner runs prompt-composer once at
   *  preflight time (Q-44.G LOCKED). */
  prompt: string
  /** Visible copy lines for concept-0 (h + s overlays). Surfaces to the
   *  keyword-blocklist + claim-regex checkers via `joinTextSurface`. */
  copyTexts: string[]
  /** Top-level run param — drives the aspect-ratio rule kind. */
  aspectRatio: AspectRatio
}

/** Q-44.B LOCKED: per-asset gating deferred. Asset-* fields stay
 *  unsupplied at runner-start; `assetAspectRatio` is the only asset-side
 *  hint we have, sourced from the WorkflowRunParams (not the per-asset
 *  output). */
export function buildMetaCheckInput(
  args: BuildMetaCheckInputArgs,
): PolicyCheckInput {
  // `profile` is reserved for future per-profile policy hints (e.g.
  // forbiddenContent passed as deny terms). Currently unused — the
  // surface-text checks pull everything from prompt + copyTexts.
  void args.profile
  return {
    platform: "meta",
    prompt: args.prompt,
    copyTexts: args.copyTexts,
    assetAspectRatio: args.aspectRatio,
  }
}

export interface BuildGoogleAdsCheckInputArgs {
  profile: AppProfile
  /** LLM prompt (the runner hands the composed instruction to the
   *  LLM; we expose it so the claim-regex / keyword-blocklist checkers
   *  can scan it before generation kicks off). */
  prompt: string
  /** Headline + description copy lines surfaced to the policy checks
   *  so style-discouragement rules (e.g. "click here") match before
   *  the LLM call burns. Synthesized from the deterministic fallback
   *  at preflight; the actual generated copy lands in the audit blob
   *  via finalizeBatch. */
  copyTexts: string[]
}

export function buildGoogleAdsCheckInput(
  args: BuildGoogleAdsCheckInputArgs,
): PolicyCheckInput {
  void args.profile
  return {
    platform: "google-ads",
    prompt: args.prompt,
    copyTexts: args.copyTexts,
  }
}

/** PLACEHOLDER — Phase F1 (Play ASO) un-stubs this helper. */
export function buildPlayCheckInput(): PolicyCheckInput {
  throw new Error(
    "buildPlayCheckInput: not implemented yet — wired in Phase F1",
  )
}
