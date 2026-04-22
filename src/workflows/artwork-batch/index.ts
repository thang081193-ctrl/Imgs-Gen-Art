// BOOTSTRAP-PHASE3 Step 3 — artwork-batch workflow registration.
//
// Production wiring resolves deps lazily from asset-store context + provider
// registry at first run() call. Tests can build a custom instance via
// createArtworkBatchRun() with stub deps (see tests/unit/workflow-artwork-batch.test.ts).

import type { WorkflowDefinition } from "@/workflows/types"
import { getAssetRepo, getBatchRepo } from "@/server/asset-store/context"
import { getProvider } from "@/server/providers/registry"

import { ArtworkBatchInputSchema } from "./input-schema"
import { createArtworkBatchRun } from "./run"

export { createArtworkBatchRun } from "./run"
export { generateConcepts, pickConcepts, deriveSeed } from "./concept-generator"
export { buildPrompt } from "./prompt-builder"
export {
  ArtworkBatchInputSchema,
  type ArtworkBatchInput,
} from "./input-schema"

export const artworkBatchWorkflow: WorkflowDefinition = {
  id: "artwork-batch",
  displayName: "Artwork Batch",
  description:
    "Generate themed artwork batches across a curated category. Seeded mulberry32 shuffle picks N concepts from the group pool; each concept is rendered V times for variant coverage.",
  colorVariant: "violet",
  requirement: {
    required: ["supportsTextToImage"],
    preferred: ["supportsTextInImage", "supportsDeterministicSeed"],
  },
  compatibilityOverrides: [],
  inputSchema: ArtworkBatchInputSchema,
  run: createArtworkBatchRun(() => ({
    assetRepo: getAssetRepo(),
    batchRepo: getBatchRepo(),
    provider: getProvider("mock"),
  })),
}
