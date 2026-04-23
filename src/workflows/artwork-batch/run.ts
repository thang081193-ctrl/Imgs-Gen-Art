// BOOTSTRAP-PHASE3 Step 3 — artwork-batch runner.
//
// Pure AsyncGenerator: yields PLAN §6.3 WorkflowEvent stream for
// (started → concept_generated × N → image_generated × N × V → complete).
// File write + DB insert isolated in ./asset-writer.ts so this file
// focuses on event flow + abort + error handling.

import type { AssetDto } from "@/core/dto/asset-dto"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import { getModel } from "@/core/model-registry/models"
import type { ImageProvider } from "@/core/providers/types"
import { finalizeBatch, type AssetRepo, type BatchRepo } from "@/server/asset-store"
import { getArtworkGroups } from "@/server/templates"
import type { WorkflowRunParams } from "@/workflows/types"

import {
  DEFAULT_ASSETS_DIR,
  writeAssetAndInsert,
} from "./asset-writer"
import { generateConcepts } from "./concept-generator"
import type { ArtworkBatchInput } from "./input-schema"
import { buildPrompt } from "./prompt-builder"

export interface ArtworkBatchDeps {
  assetRepo: AssetRepo
  batchRepo: BatchRepo
  provider: ImageProvider
}

export interface ArtworkBatchOptions {
  assetsDir?: string
  /** Clock override for tests. Defaults to `() => new Date()`. */
  now?: () => Date
}

export function createArtworkBatchRun(
  resolveDeps: (params: WorkflowRunParams) => ArtworkBatchDeps,
  options: ArtworkBatchOptions = {},
): (params: WorkflowRunParams) => AsyncGenerator<WorkflowEvent> {
  const assetsDir = options.assetsDir ?? DEFAULT_ASSETS_DIR
  const nowFn = options.now ?? (() => new Date())

  return async function* run(params: WorkflowRunParams): AsyncGenerator<WorkflowEvent> {
    const deps = resolveDeps(params)
    const input = params.input as ArtworkBatchInput  // validated by precondition #8
    const locale = params.language ?? "en"
    const batchSeed = input.seed ?? Date.now()

    const model = getModel(params.modelId)
    if (!model) {
      // Defense in depth — precondition #3 already validated this, but
      // narrow the undefined for the compiler + guard against test paths
      // that bypass precondition-check.
      throw new Error(`artwork-batch: unknown modelId '${params.modelId}'`)
    }

    const templates = getArtworkGroups()
    const concepts = generateConcepts({ input, templates, batchSeed })
    const total = concepts.length * input.variantsPerConcept

    deps.batchRepo.create({
      id: params.batchId,
      profileId: params.profile.id,
      workflowId: "artwork-batch",
      totalAssets: total,
      status: "running",
      startedAt: nowFn().toISOString(),
    })

    yield { type: "started", batchId: params.batchId, total }

    const assets: AssetDto[] = []
    let successfulAssets = 0
    let globalIndex = 0

    for (let ci = 0; ci < concepts.length; ci++) {
      const concept = concepts[ci]!
      yield { type: "concept_generated", concept, index: ci }

      for (let vi = 0; vi < input.variantsPerConcept; vi++) {
        if (params.abortSignal.aborted) {
          finalizeBatch({
            batchId: params.batchId,
            status: "aborted",
            assetRepo: deps.assetRepo,
            batchRepo: deps.batchRepo,
            at: nowFn().toISOString(),
          })
          yield {
            type: "aborted",
            batchId: params.batchId,
            completedCount: successfulAssets,
            totalCount: total,
          }
          return
        }

        const prompt = buildPrompt({ concept, profile: params.profile, locale })

        try {
          const generateResult = await deps.provider.generate({
            prompt,
            modelId: params.modelId,
            aspectRatio: params.aspectRatio,
            seed: concept.seed,
            abortSignal: params.abortSignal,
            providerSpecificParams: { addWatermark: false },
            ...(params.language !== undefined ? { language: params.language } : {}),
          })

          const asset = writeAssetAndInsert(
            {
              profile: params.profile,
              batchId: params.batchId,
              concept,
              prompt,
              providerId: params.providerId,
              model,
              aspectRatio: params.aspectRatio,
              language: params.language,
              tagGroup: input.group,
              generateResult,
              assetsDir,
              now: nowFn(),
            },
            deps.assetRepo,
          )

          assets.push(asset)
          successfulAssets++
          yield { type: "image_generated", asset, index: globalIndex }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          yield {
            type: "error",
            error: { message },
            context: `concept='${concept.title}', variant=${vi}`,
            index: globalIndex,
          }
        }

        globalIndex++
      }
    }

    finalizeBatch({
      batchId: params.batchId,
      status: "completed",
      assetRepo: deps.assetRepo,
      batchRepo: deps.batchRepo,
      at: nowFn().toISOString(),
    })
    yield { type: "complete", assets, batchId: params.batchId }
  }
}
