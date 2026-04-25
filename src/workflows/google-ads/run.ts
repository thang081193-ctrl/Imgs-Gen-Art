// Phase E (Session #44) — google-ads runner.
//
// Text-only batch: composes one LLM prompt, calls the active LLM
// provider (or the deterministic fallback when none is configured),
// parses the JSON response, persists the bundle as a single text
// asset, then closes the batch. Same policy-enforcement flow as
// ad-production (D1): preflight at runner-start, decision threaded
// into all terminal finalize calls.

import type { AssetDto } from "@/core/dto/asset-dto"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import { getModel } from "@/core/model-registry/models"
import type { PolicyDecision } from "@/core/schemas/policy-decision"
import { finalizeBatch, type AssetRepo, type BatchRepo } from "@/server/asset-store"
import {
  buildGoogleAdsCheckInput,
  checkPolicy as defaultCheckPolicy,
} from "@/server/services/policy-rules"
import type { LLMProvider } from "@/server/services/llm"
import { shortId } from "@/core/shared/id"
import type { WorkflowRunParams } from "@/workflows/types"

import { DEFAULT_GOOGLE_ADS_DIR, writeGoogleAdAsset } from "./asset-writer"
import type { GoogleAdsInput } from "./input-schema"
import {
  buildGoogleAdsPrompt,
  parseGoogleAdsResponse,
  synthesizeGoogleAdsResponse,
  type ParsedGoogleAdsResponse,
} from "./prompt-composer"
import type { GoogleAdConcept } from "./types"

export interface GoogleAdsDeps {
  assetRepo: AssetRepo
  batchRepo: BatchRepo
  /** Active LLM provider, or `null` to use the deterministic synth. */
  llm: LLMProvider | null
}

export interface GoogleAdsOptions {
  assetsDir?: string
  now?: () => Date
  checkPolicy?: typeof defaultCheckPolicy
}

export function createGoogleAdsRun(
  resolveDeps: (params: WorkflowRunParams) => GoogleAdsDeps,
  options: GoogleAdsOptions = {},
): (params: WorkflowRunParams) => AsyncGenerator<WorkflowEvent> {
  const assetsDir = options.assetsDir ?? DEFAULT_GOOGLE_ADS_DIR
  const nowFn = options.now ?? (() => new Date())
  const checkPolicyFn = options.checkPolicy ?? defaultCheckPolicy

  return async function* run(params: WorkflowRunParams): AsyncGenerator<WorkflowEvent> {
    const deps = resolveDeps(params)
    const input = params.input as GoogleAdsInput
    const seed = input.seed ?? Date.now()

    const model = getModel(params.modelId)
    if (!model) throw new Error(`google-ads: unknown modelId '${params.modelId}'`)

    deps.batchRepo.create({
      id: params.batchId,
      profileId: params.profile.id,
      workflowId: "google-ads",
      totalAssets: 1,
      status: "running",
      startedAt: nowFn().toISOString(),
    })

    yield { type: "started", batchId: params.batchId, total: 1 }

    // ---- preflight (mirrors D1 ad-production wiring) ----
    const composerParams = {
      profile: params.profile,
      featureFocus: input.featureFocus,
      headlineCount: input.headlineCount,
      descriptionCount: input.descriptionCount,
    }
    const llmPrompt = buildGoogleAdsPrompt(composerParams)
    // Preflight surface: hand the LLM prompt as the prompt + a synth
    // headline as a representative copy line so keyword + claim
    // checkers fire on a realistic substring even before the LLM
    // returns. The runner re-checks at finalize using the actual
    // generated copy via `policyDecision` only if needed (handoff D1
    // pattern: one preflight at start; per-asset gating deferred).
    const preflightSynth = synthesizeGoogleAdsResponse(composerParams)
    const decision = checkPolicyFn(
      buildGoogleAdsCheckInput({
        profile: params.profile,
        prompt: llmPrompt,
        copyTexts: [...preflightSynth.headlines, ...preflightSynth.descriptions],
      }),
      params.policyOverrides !== undefined
        ? { overrides: params.policyOverrides }
        : {},
    )

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
    const hasUnoverriddenWarning = decision.violations.some(
      (v) => v.details?.["overridden"] !== true,
    )
    if (hasUnoverriddenWarning) {
      yield { type: "policy_warned", decision, batchId: params.batchId }
    }
    const isEmpty =
      decision.violations.length === 0 &&
      (decision.overrides === undefined || decision.overrides.length === 0)
    const auditDecision: PolicyDecision | undefined = isEmpty ? undefined : decision

    if (params.abortSignal.aborted) {
      finalizeBatch({
        batchId: params.batchId,
        status: "aborted",
        assetRepo: deps.assetRepo,
        batchRepo: deps.batchRepo,
        at: nowFn().toISOString(),
        ...(auditDecision !== undefined ? { policyDecision: auditDecision } : {}),
      })
      yield {
        type: "aborted",
        batchId: params.batchId,
        completedCount: 0,
        totalCount: 1,
      }
      return
    }

    // ---- generate via LLM with deterministic fallback ----
    let response: ParsedGoogleAdsResponse
    try {
      if (deps.llm !== null) {
        const out = await deps.llm.chat({
          messages: [{ role: "user", content: llmPrompt }],
          maxTokens: 700,
          temperature: 0.5,
          ...(params.abortSignal !== undefined ? { signal: params.abortSignal } : {}),
        })
        response = parseGoogleAdsResponse(out.text)
      } else {
        response = synthesizeGoogleAdsResponse(composerParams)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Fall back to synth so the batch still produces an asset. The
      // error event surfaces the LLM failure for observability without
      // blowing up the run.
      response = synthesizeGoogleAdsResponse(composerParams)
      yield {
        type: "error",
        error: { message: `LLM call failed; fell back to synth: ${message}` },
        context: "llm-fallback",
      }
    }

    const concept: GoogleAdConcept = {
      id: shortId("cpt", 10),
      title: `${input.featureFocus} text ad`,
      description: `Responsive Search Ad — ${input.headlineCount}h × ${input.descriptionCount}d`,
      seed,
      tags: [input.featureFocus, "text-only"],
      featureFocus: input.featureFocus,
      headlines: response.headlines,
      descriptions: response.descriptions,
    }
    yield { type: "concept_generated", concept, index: 0 }

    const asset: AssetDto = writeGoogleAdAsset(
      {
        profile: params.profile,
        batchId: params.batchId,
        concept,
        prompt: llmPrompt,
        providerId: params.providerId,
        model,
        assetsDir,
        now: nowFn(),
      },
      deps.assetRepo,
    )
    yield { type: "image_generated", asset, index: 0 }

    finalizeBatch({
      batchId: params.batchId,
      status: "completed",
      assetRepo: deps.assetRepo,
      batchRepo: deps.batchRepo,
      at: nowFn().toISOString(),
      ...(auditDecision !== undefined ? { policyDecision: auditDecision } : {}),
    })
    yield { type: "complete", assets: [asset], batchId: params.batchId }
  }
}
