// Session #15 — style-transform runner.
//
// Q2 precondition: `sourceImageAssetId` MUST resolve to a profile_asset row
// with kind="screenshot" FOR THIS profile. Enforced before the first yield
// so a bad id bubbles up as a real HTTP 400 (SOURCE_ASSET_NOT_FOUND) via
// the dispatcher's "pump first event" pattern — never as an SSE error frame.

import type { AssetDto } from "@/core/dto/asset-dto"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import { getModel } from "@/core/model-registry/models"
import type { ImageProvider } from "@/core/providers/types"
import { BadRequestError } from "@/core/shared/errors"
import {
  finalizeBatch,
  type AssetRepo,
  type BatchRepo,
  type ProfileAssetsRepo,
} from "@/server/asset-store"
import { getStyleDna } from "@/server/templates"
import type { WorkflowRunParams } from "@/workflows/types"

import { DEFAULT_ASSETS_DIR, writeStyleAsset } from "./asset-writer"
import { generateStyleConcepts } from "./concept-generator"
import type { StyleTransformInput } from "./input-schema"
import { buildStylePrompt } from "./prompt-composer"

export interface StyleTransformDeps {
  assetRepo: AssetRepo
  batchRepo: BatchRepo
  profileAssetsRepo: ProfileAssetsRepo
  provider: ImageProvider
}

export interface StyleTransformOptions {
  assetsDir?: string
  now?: () => Date
}

export function createStyleTransformRun(
  resolveDeps: () => StyleTransformDeps,
  options: StyleTransformOptions = {},
): (params: WorkflowRunParams) => AsyncGenerator<WorkflowEvent> {
  const assetsDir = options.assetsDir ?? DEFAULT_ASSETS_DIR
  const nowFn = options.now ?? (() => new Date())

  return async function* run(params: WorkflowRunParams): AsyncGenerator<WorkflowEvent> {
    const deps = resolveDeps()
    const input = params.input as StyleTransformInput
    const locale = params.language ?? "en"
    const batchSeed = input.seed ?? Date.now()

    const model = getModel(params.modelId)
    if (!model) throw new Error(`style-transform: unknown modelId '${params.modelId}'`)

    // Q2 precondition — source asset must be a screenshot on this profile.
    const sourceAsset = deps.profileAssetsRepo.findById(input.sourceImageAssetId)
    if (!sourceAsset) {
      throw new BadRequestError(
        `sourceImageAssetId '${input.sourceImageAssetId}' not found`,
        { code: "SOURCE_ASSET_NOT_FOUND", sourceAssetId: input.sourceImageAssetId },
      )
    }
    if (sourceAsset.profileId !== params.profile.id) {
      throw new BadRequestError(
        `sourceImageAssetId '${input.sourceImageAssetId}' does not belong to profile '${params.profile.id}'`,
        { code: "SOURCE_ASSET_PROFILE_MISMATCH", sourceAssetId: input.sourceImageAssetId },
      )
    }
    if (sourceAsset.kind !== "screenshot") {
      throw new BadRequestError(
        `sourceImageAssetId '${input.sourceImageAssetId}' must be a screenshot (got kind='${sourceAsset.kind}')`,
        { code: "SOURCE_ASSET_WRONG_KIND", kind: sourceAsset.kind },
      )
    }

    const styles = getStyleDna()
    const concepts = generateStyleConcepts({
      conceptCount: input.conceptCount,
      styleDnaKey: input.styleDnaKey,
      sourceAssetId: input.sourceImageAssetId,
      batchSeed,
      styles,
    })
    const total = concepts.length * input.variantsPerConcept

    deps.batchRepo.create({
      id: params.batchId,
      profileId: params.profile.id,
      workflowId: "style-transform",
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

        const prompt = buildStylePrompt({
          concept,
          profile: params.profile,
          locale,
          variantIndex: vi,
          styles,
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

          const asset = writeStyleAsset(
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
