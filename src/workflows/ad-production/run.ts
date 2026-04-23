// Session #15 — ad-production runner.
//
// Async generator following the artwork-batch template 1:1 (Q4: factory
// pattern, no deviation). Differences:
//   - pulls ad-layouts + copy-templates from the server template cache
//   - buildAdPrompt is called per (concept, variantIndex) so each variant
//     picks a different h/s line from the copy row
//   - asset-writer variant persisted via writeAdAsset

import type { AssetDto } from "@/core/dto/asset-dto"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import { getModel } from "@/core/model-registry/models"
import type { ImageProvider } from "@/core/providers/types"
import { finalizeBatch, type AssetRepo, type BatchRepo } from "@/server/asset-store"
import { getAdLayouts, getCopyTemplates } from "@/server/templates"
import type { WorkflowRunParams } from "@/workflows/types"

import { DEFAULT_ASSETS_DIR, writeAdAsset } from "./asset-writer"
import { generateAdConcepts } from "./concept-generator"
import type { AdProductionInput } from "./input-schema"
import { buildAdPrompt } from "./prompt-composer"

export interface AdProductionDeps {
  assetRepo: AssetRepo
  batchRepo: BatchRepo
  provider: ImageProvider
}

export interface AdProductionOptions {
  assetsDir?: string
  now?: () => Date
}

export function createAdProductionRun(
  resolveDeps: () => AdProductionDeps,
  options: AdProductionOptions = {},
): (params: WorkflowRunParams) => AsyncGenerator<WorkflowEvent> {
  const assetsDir = options.assetsDir ?? DEFAULT_ASSETS_DIR
  const nowFn = options.now ?? (() => new Date())

  return async function* run(params: WorkflowRunParams): AsyncGenerator<WorkflowEvent> {
    const deps = resolveDeps()
    const input = params.input as AdProductionInput
    const locale = params.language ?? "en"
    const batchSeed = input.seed ?? Date.now()

    const model = getModel(params.modelId)
    if (!model) throw new Error(`ad-production: unknown modelId '${params.modelId}'`)

    const layouts = getAdLayouts()
    const copyTemplates = getCopyTemplates()

    const concepts = generateAdConcepts({
      conceptCount: input.conceptCount,
      featureFocus: input.featureFocus,
      batchSeed,
      layouts,
      copyTemplates,
    })
    const total = concepts.length * input.variantsPerConcept

    deps.batchRepo.create({
      id: params.batchId,
      profileId: params.profile.id,
      workflowId: "ad-production",
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

        const prompt = buildAdPrompt({
          concept,
          profile: params.profile,
          locale,
          variantIndex: vi,
          layouts,
          copyTemplates,
        })

        try {
          const generateResult = await deps.provider.generate({
            prompt,
            modelId: params.modelId,
            aspectRatio: params.aspectRatio,
            seed: concept.seed,
            abortSignal: params.abortSignal,
            ...(params.language !== undefined ? { language: params.language } : {}),
          })

          const asset = writeAdAsset(
            {
              profile: params.profile,
              batchId: params.batchId,
              concept,
              prompt,
              providerId: params.providerId,
              model,
              aspectRatio: params.aspectRatio,
              language: params.language,
              generateResult,
              assetsDir,
              now: nowFn(),
              variantIndex: vi,
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
