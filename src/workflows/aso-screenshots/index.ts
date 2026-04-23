// Session #15 — aso-screenshots workflow registration.

import type { WorkflowDefinition } from "@/workflows/types"
import { getAssetRepo, getBatchRepo } from "@/server/asset-store/context"
import { getProvider } from "@/server/providers/registry"

import { asoScreenshotsOverrides } from "./overrides"
import { AsoScreenshotsInputSchema } from "./input-schema"
import { createAsoScreenshotsRun } from "./run"

export { createAsoScreenshotsRun } from "./run"
export {
  generateAsoConcepts,
  phoneUiLayoutIds,
  pickAsoLayouts,
} from "./concept-generator"
export { buildAsoPrompt } from "./prompt-composer"
export { writeAsoAsset } from "./asset-writer"
export {
  AsoScreenshotsInputSchema,
  type AsoScreenshotsInput,
} from "./input-schema"
export { asoScreenshotsOverrides } from "./overrides"
export type { AsoConcept } from "./types"

export const asoScreenshotsWorkflow: WorkflowDefinition = {
  id: "aso-screenshots",
  displayName: "ASO Screenshots",
  description:
    "Generate device-framed App Store preview screenshots. N phone-UI layout concepts × targetLangs × V variants produce localized store-listing assets from a single batch.",
  colorVariant: "emerald",
  requirement: {
    required: ["supportsTextToImage", "supportsTextInImage"],
    preferred: ["supportsDeterministicSeed"],
  },
  compatibilityOverrides: asoScreenshotsOverrides,
  inputSchema: AsoScreenshotsInputSchema,
  run: createAsoScreenshotsRun((params) => ({
    assetRepo: getAssetRepo(),
    batchRepo: getBatchRepo(),
    provider: getProvider(params.providerId),
  })),
}
