// Session #15 — style-transform workflow registration.
//
// Factory-pattern identical to artwork-batch + ad-production. `profileAssetsRepo`
// added to deps for the Q2 source-asset precondition.

import type { WorkflowDefinition } from "@/workflows/types"
import {
  getAssetRepo,
  getBatchRepo,
  getProfileAssetsRepo,
} from "@/server/asset-store/context"
import { getProvider } from "@/server/providers/registry"

import { styleTransformOverrides } from "./overrides"
import { StyleTransformInputSchema } from "./input-schema"
import { createStyleTransformRun } from "./run"

export { createStyleTransformRun } from "./run"
export { generateStyleConcepts } from "./concept-generator"
export { buildStylePrompt } from "./prompt-composer"
export { writeStyleAsset } from "./asset-writer"
export {
  StyleTransformInputSchema,
  type StyleTransformInput,
} from "./input-schema"
export { styleTransformOverrides } from "./overrides"
export type { StyleConcept } from "./types"

export const styleTransformWorkflow: WorkflowDefinition = {
  id: "style-transform",
  displayName: "Style Transform",
  description:
    "Re-style an existing profile screenshot using one of the locked Art-DNA templates (Anime / Ghibli / Pixar). N concepts × V variants produce alternate interpretations at deterministic seeds for Phase 5 replay.",
  colorVariant: "pink",
  requirement: {
    required: [
      "supportsTextToImage",
      "supportsImageEditing",
      "supportsStyleReference",
    ],
    preferred: ["supportsCharacterConsistency", "supportsDeterministicSeed"],
  },
  compatibilityOverrides: styleTransformOverrides,
  inputSchema: StyleTransformInputSchema,
  run: createStyleTransformRun((params) => ({
    assetRepo: getAssetRepo(),
    batchRepo: getBatchRepo(),
    profileAssetsRepo: getProfileAssetsRepo(),
    provider: getProvider(params.providerId),
  })),
}
