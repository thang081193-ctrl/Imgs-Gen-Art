// Phase E (Session #44) — google-ads workflow registration.
//
// Mirrors ad-production/index.ts: deps resolved lazily via getters from
// the asset-store context + LLM registry. No image-gen provider —
// LLM-only via getActiveLLMProvider() (or the deterministic synth when
// no LLM is configured).

import type { WorkflowDefinition } from "@/workflows/types"
import { getAssetRepo, getBatchRepo } from "@/server/asset-store/context"
import { getActiveLLMProvider } from "@/server/services/llm"

import { GoogleAdsInputSchema } from "./input-schema"
import { createGoogleAdsRun } from "./run"

export { createGoogleAdsRun } from "./run"
export {
  buildGoogleAdsPrompt,
  parseGoogleAdsResponse,
  synthesizeGoogleAdsResponse,
} from "./prompt-composer"
export { writeGoogleAdAsset } from "./asset-writer"
export {
  GoogleAdsInputSchema,
  type GoogleAdsInput,
} from "./input-schema"
export type { GoogleAdConcept } from "./types"

export const googleAdsWorkflow: WorkflowDefinition = {
  id: "google-ads",
  displayName: "Google Ads",
  description:
    "Generate Google Responsive Search Ads — headlines + descriptions composed by an LLM, scoped to the app profile + featureFocus. Text-only; no image generation.",
  colorVariant: "sky",
  // Text-only — no image-gen capabilities required. The runner falls
  // back to a deterministic synth when no LLM is registered, so the
  // capability matrix stays permissive (any provider works).
  requirement: {
    required: [],
    preferred: [],
  },
  compatibilityOverrides: [],
  inputSchema: GoogleAdsInputSchema,
  run: createGoogleAdsRun(() => ({
    assetRepo: getAssetRepo(),
    batchRepo: getBatchRepo(),
    llm: getActiveLLMProvider(),
  })),
}
