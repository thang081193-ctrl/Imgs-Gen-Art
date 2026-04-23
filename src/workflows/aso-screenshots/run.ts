// Session #15 — aso-screenshots runner.
//
// Three-level loop: concepts × targetLangs × variants. Total asset count
// is `conceptCount × targetLangs.length × variantsPerConcept` — the
// exponential growth Q3 caps at 3 targetLangs.
//
// Q3 runtime precondition: targetLangs ⊆ model.capability.supportedLanguages.
// Enforced before the first yield so unsupported langs surface as
// 409 RUNTIME_VALIDATION_FAILED (matches aspect-ratio / language validator
// semantics in precondition-check.ts #6).

import type { AssetDto } from "@/core/dto/asset-dto"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import { getModel } from "@/core/model-registry/models"
import type { ImageProvider } from "@/core/providers/types"
import { RuntimeValidationError } from "@/core/shared/errors"
import { deriveSeed } from "@/core/shared/rand"
import { finalizeBatch, type AssetRepo, type BatchRepo } from "@/server/asset-store"
import { getAdLayouts, getCopyTemplates } from "@/server/templates"
import type { WorkflowRunParams } from "@/workflows/types"

import { DEFAULT_ASSETS_DIR, writeAsoAsset } from "./asset-writer"
import { generateAsoConcepts } from "./concept-generator"
import type { AsoScreenshotsInput } from "./input-schema"
import { buildAsoPrompt } from "./prompt-composer"

export interface AsoScreenshotsDeps {
  assetRepo: AssetRepo
  batchRepo: BatchRepo
  provider: ImageProvider
}

export interface AsoScreenshotsOptions {
  assetsDir?: string
  now?: () => Date
}

export function createAsoScreenshotsRun(
  resolveDeps: () => AsoScreenshotsDeps,
  options: AsoScreenshotsOptions = {},
): (params: WorkflowRunParams) => AsyncGenerator<WorkflowEvent> {
  const assetsDir = options.assetsDir ?? DEFAULT_ASSETS_DIR
  const nowFn = options.now ?? (() => new Date())

  return async function* run(params: WorkflowRunParams): AsyncGenerator<WorkflowEvent> {
    const deps = resolveDeps()
    const input = params.input as AsoScreenshotsInput
    const locale = params.language ?? "en"
    const batchSeed = input.seed ?? Date.now()

    const model = getModel(params.modelId)
    if (!model) throw new Error(`aso-screenshots: unknown modelId '${params.modelId}'`)

    // Q3 runtime validation — every targetLang must be in the model's
    // supportedLanguages. Fast-fail to 409 before ANY DB write so a
    // provider that can't serve the request never costs us a batch row.
    const supportedSet = new Set<string>(model.capability.supportedLanguages)
    const unsupported = input.targetLangs.filter((lang) => !supportedSet.has(lang))
    if (unsupported.length > 0) {
      throw new RuntimeValidationError(
        `targetLangs ${JSON.stringify(unsupported)} not supported by ${model.providerId}:${model.id}; allowed: ${model.capability.supportedLanguages.join(", ")}`,
        {
          code: "LANGUAGE_UNSUPPORTED",
          modelId: model.id,
          unsupportedLangs: unsupported,
        },
      )
    }

    const layouts = getAdLayouts()
    const copyTemplates = getCopyTemplates()
    const concepts = generateAsoConcepts({
      conceptCount: input.conceptCount,
      batchSeed,
      layouts,
    })
    const total = concepts.length * input.targetLangs.length * input.variantsPerConcept

    deps.batchRepo.create({
      id: params.batchId,
      profileId: params.profile.id,
      workflowId: "aso-screenshots",
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

      for (const targetLang of input.targetLangs) {
        const assetSeed = deriveSeed(batchSeed, `${concept.layoutId}:${targetLang}`)

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

          const prompt = buildAsoPrompt({
            concept,
            profile: params.profile,
            locale,
            targetLang,
            variantIndex: vi,
            layouts,
            copyTemplates,
          })

          try {
            const generateResult = await deps.provider.generate({
              prompt,
              modelId: params.modelId,
              aspectRatio: params.aspectRatio,
              seed: assetSeed,
              abortSignal: params.abortSignal,
              ...(params.language !== undefined ? { language: params.language } : {}),
            })

            const asset = writeAsoAsset(
              {
                profile: params.profile,
                batchId: params.batchId,
                concept,
                prompt,
                providerId: params.providerId,
                model,
                aspectRatio: params.aspectRatio,
                language: params.language,
                targetLang,
                assetSeed,
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
              context: `concept='${concept.title}', lang=${targetLang}, variant=${vi}`,
              index: globalIndex,
            }
          }

          globalIndex++
        }
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
