// Session #15 — ad-production runner.
//
// Async generator following the artwork-batch template 1:1 (Q4: factory
// pattern, no deviation). Differences:
//   - pulls ad-layouts + copy-templates from the server template cache
//   - buildAdPrompt is called per (concept, variantIndex) so each variant
//     picks a different h/s line from the copy row
//   - asset-writer variant persisted via writeAdAsset
//
// Phase D1 (Session #44) — preflight policy enforcement runs once after
// batchRepo.create:
//   - composes concept-0 prompt + lifts the (h, s) overlay copy as the
//     keyword/claim surface (Q-44.G LOCKED)
//   - block path: emits `policy_blocked` → `error` (code:"PolicyBlocked")
//     → finalize(error, decision) → returns; no per-asset image events
//   - warning path: emits `policy_warned`, threads decision through both
//     terminal finalize calls (aborted + completed)
//   - clean path: no policy event; finalize calls leave audit blob NULL
//     (Q-44.F skip-on-empty)

import type { AssetDto } from "@/core/dto/asset-dto"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import { getModel } from "@/core/model-registry/models"
import type { ImageProvider } from "@/core/providers/types"
import type { PolicyDecision } from "@/core/schemas/policy-decision"
import { finalizeBatch, type AssetRepo, type BatchRepo } from "@/server/asset-store"
import {
  buildMetaCheckInput,
  checkPolicy as defaultCheckPolicy,
} from "@/server/services/policy-rules"
import { getAdLayouts, getCopyTemplates } from "@/server/templates"
import { CopyLangSchema, type CopyLang } from "@/core/templates"
import type { LanguageCode } from "@/core/model-registry/types"
import type { WorkflowRunParams } from "@/workflows/types"

// Session #35 F2 — narrow the top-level LanguageCode down to a CopyLang.
// LanguageCode is wider (hi/zh*) but copy-templates only ship 10 CopyLang
// keys; anything outside that set (or undefined) falls back to "en" so the
// concept-generator never faces a missing locale bucket.
function resolveCopyLocale(lang: LanguageCode | undefined): CopyLang {
  const parsed = CopyLangSchema.safeParse(lang)
  return parsed.success ? parsed.data : "en"
}

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
  // Phase D1 (Session #44) — DI seam so unit tests can stub the
  // aggregator without leaning on the on-disk meta.json rule set.
  // Production callers leave this undefined → real `checkPolicy` runs.
  checkPolicy?: typeof defaultCheckPolicy
}

export function createAdProductionRun(
  resolveDeps: (params: WorkflowRunParams) => AdProductionDeps,
  options: AdProductionOptions = {},
): (params: WorkflowRunParams) => AsyncGenerator<WorkflowEvent> {
  const assetsDir = options.assetsDir ?? DEFAULT_ASSETS_DIR
  const nowFn = options.now ?? (() => new Date())
  const checkPolicyFn = options.checkPolicy ?? defaultCheckPolicy

  return async function* run(params: WorkflowRunParams): AsyncGenerator<WorkflowEvent> {
    const deps = resolveDeps(params)
    const input = params.input as AdProductionInput
    const locale = resolveCopyLocale(params.language)
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
      locale,
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

    // ---- Phase D1 preflight ----
    let auditDecision: PolicyDecision | undefined
    const conceptZero = concepts[0]
    if (conceptZero) {
      const preflightPrompt = buildAdPrompt({
        concept: conceptZero,
        profile: params.profile,
        locale,
        variantIndex: 0,
        layouts,
        copyTemplates,
      })
      const copyEntry = copyTemplates.templates[conceptZero.copyKey as CopyLang]
      const copyTexts: string[] =
        copyEntry !== undefined
          ? [copyEntry.h[0] ?? "", copyEntry.s[0] ?? ""].filter((s) => s.length > 0)
          : []
      const decision = checkPolicyFn(
        buildMetaCheckInput({
          profile: params.profile,
          prompt: preflightPrompt,
          copyTexts,
          aspectRatio: params.aspectRatio,
        }),
        params.policyOverrides !== undefined
          ? { overrides: params.policyOverrides }
          : {},
      )
      // Block path: unconditional rejection (Q-43.D LOCKED — block
      // severity is not overridable). Decision goes into the audit blob
      // BEFORE the error event so callers reading `policy_decision_json`
      // never see a `status:"error"` row missing its `ok:false` reason.
      if (!decision.ok) {
        yield { type: "policy_blocked", decision, batchId: params.batchId }
        finalizeBatch({
          batchId: params.batchId,
          status: "error",
          assetRepo: deps.assetRepo,
          batchRepo: deps.batchRepo,
          at: nowFn().toISOString(),
          policyDecision: decision,
        })
        yield {
          type: "error",
          error: {
            message: "Workflow blocked by policy violation.",
            code: "PolicyBlocked",
          },
          context: "policy-preflight",
        }
        return
      }
      // Warning path: emit only when the decision still has un-overridden
      // violations. An override-cleared warning behaves like the clean
      // path on the SSE wire but the decision is still persisted (the
      // override row itself is part of the audit trail).
      const hasUnoverriddenWarning = decision.violations.some(
        (v) => v.details?.["overridden"] !== true,
      )
      if (hasUnoverriddenWarning) {
        yield { type: "policy_warned", decision, batchId: params.batchId }
      }
      // Q-44.F LOCKED: skip the audit-blob write only when the decision
      // is fully empty (no violations + no overrides). An override-only
      // decision still reaches the column so bro can later inspect "what
      // was waved through and by whom".
      const isEmpty =
        decision.violations.length === 0 &&
        (decision.overrides === undefined || decision.overrides.length === 0)
      auditDecision = isEmpty ? undefined : decision
    }

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
            ...(auditDecision !== undefined
              ? { policyDecision: auditDecision }
              : {}),
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
            providerSpecificParams: { addWatermark: false },
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
      ...(auditDecision !== undefined ? { policyDecision: auditDecision } : {}),
    })
    yield { type: "complete", assets, batchId: params.batchId }
  }
}
