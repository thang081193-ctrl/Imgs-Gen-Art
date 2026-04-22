// Session #15 — ad-production workflow registration.
//
// Identical factory-pattern to artwork-batch/index.ts (Q4): deps resolved
// lazily via getters from the asset-store context + provider registry.
// Phase 3 hardcodes `getProvider("mock")`; Phase 4 switches to
// `getProvider(params.providerId)` — single-line diff.

import type { WorkflowDefinition } from "@/workflows/types"
import { getAssetRepo, getBatchRepo } from "@/server/asset-store/context"
import { getProvider } from "@/server/providers/registry"

import { adProductionOverrides } from "./overrides"
import { AdProductionInputSchema } from "./input-schema"
import { createAdProductionRun } from "./run"

export { createAdProductionRun } from "./run"
export {
  cartesianPairs,
  generateAdConcepts,
  pickPairs,
} from "./concept-generator"
export { buildAdPrompt } from "./prompt-composer"
export { writeAdAsset } from "./asset-writer"
export {
  AdProductionInputSchema,
  type AdProductionInput,
} from "./input-schema"
export { adProductionOverrides } from "./overrides"
export type { AdConcept } from "./types"

export const adProductionWorkflow: WorkflowDefinition = {
  id: "ad-production",
  displayName: "Ad Production",
  description:
    "Render before/after ad visualizations for a feature focus. Seeded shuffle picks N (layout × copy) pairs; V variants per pair rotate through the copy-template's headline set so you get diverse cuts without re-seeding.",
  colorVariant: "blue",
  requirement: {
    required: ["supportsTextToImage", "supportsTextInImage"],
    preferred: ["supportsStyleReference", "supportsDeterministicSeed"],
  },
  compatibilityOverrides: adProductionOverrides,
  inputSchema: AdProductionInputSchema,
  run: createAdProductionRun(() => ({
    assetRepo: getAssetRepo(),
    batchRepo: getBatchRepo(),
    provider: getProvider("mock"),
  })),
}
