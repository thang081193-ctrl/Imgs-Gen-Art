// BOOTSTRAP-PHASE3 Step 2 — precondition sweep (PLAN §6.4 preconditions 1-8).
//
// Runs before dispatcher delegates to workflow.run(). On failure, throws the
// typed error that the error-handler middleware maps to an HTTP status. On
// success, returns the hydrated (workflow, profile, model, parsedInput) so
// dispatcher / workflow don't re-fetch.
//
// Dependency-injectable: unit tests pass stubbed getters. Production path
// uses module-level defaults wired to real repos/registries.

import {
  BadRequestError,
  IncompatibleWorkflowProviderError,
  NoActiveKeyError,
  RuntimeValidationError,
} from "@/core/shared/errors"
import { validateRuntime } from "@/core/compatibility/runtime-validator"
import { resolveCompatibility } from "@/core/compatibility/resolver"
import type {
  AspectRatio,
  LanguageCode,
  ModelInfo,
} from "@/core/model-registry/types"
import { getModel } from "@/core/model-registry/models"
import type { AppProfile } from "@/core/schemas/app-profile"
import { loadProfile } from "@/server/profile-repo/loader"
import { loadStoredKeys } from "@/server/keys/store"
import { getWorkflow as getWorkflowDefault } from "@/workflows"
import type { WorkflowDefinition } from "@/workflows"

export interface PreconditionParams {
  workflowId: string
  profileId: string
  providerId: string
  modelId: string
  aspectRatio: AspectRatio
  language?: LanguageCode
  input: unknown
}

export interface PreconditionDeps {
  getWorkflow?: (id: string) => WorkflowDefinition
  loadProfile?: (id: string) => AppProfile
  resolveModel?: (id: string) => ModelInfo | undefined
  hasActiveKey?: (providerId: string) => boolean
}

export interface PreconditionResult {
  workflow: WorkflowDefinition
  profile: AppProfile
  model: ModelInfo
  parsedInput: unknown
}

const BANNED_INPUT_KEYS = ["aspectRatio", "language"] as const

function defaultHasActiveKey(providerId: string): boolean {
  if (providerId === "mock") return true
  const store = loadStoredKeys()
  if (providerId === "gemini") return store.gemini.activeSlotId !== null
  if (providerId === "vertex") return store.vertex.activeSlotId !== null
  return false
}

export async function checkPreconditions(
  params: PreconditionParams,
  deps: PreconditionDeps = {},
): Promise<PreconditionResult> {
  const getWorkflow = deps.getWorkflow ?? getWorkflowDefault
  const loadProfileFn = deps.loadProfile ?? loadProfile
  const resolveModel = deps.resolveModel ?? getModel
  const hasActiveKey = deps.hasActiveKey ?? defaultHasActiveKey

  // #1 — workflow exists. NotFoundError bubbles from getWorkflow.
  const workflow = getWorkflow(params.workflowId)

  // #2 — profile exists. NotFoundError bubbles from loadProfile.
  const profile = loadProfileFn(params.profileId)

  // #3 — model exists in static catalog. Bad input otherwise.
  const model = resolveModel(params.modelId)
  if (!model) {
    throw new BadRequestError(`Unknown model '${params.modelId}'`, {
      modelId: params.modelId,
    })
  }
  if (model.providerId !== params.providerId) {
    throw new BadRequestError(
      `Model '${params.modelId}' belongs to provider '${model.providerId}', not '${params.providerId}'`,
      { modelId: params.modelId, providerId: params.providerId },
    )
  }

  // #4 — active key for provider (Mock always passes).
  if (!hasActiveKey(params.providerId)) {
    throw new NoActiveKeyError(`No active key for provider '${params.providerId}'`, {
      providerId: params.providerId,
    })
  }

  // #5 — compatibility matrix (declarative + override).
  const matrix = resolveCompatibility({
    workflows: [
      {
        id: workflow.id,
        requirement: workflow.requirement,
        compatibilityOverrides: [...workflow.compatibilityOverrides],
      },
    ],
    models: [model],
  })
  const compat = matrix[workflow.id]?.[`${model.providerId}:${model.id}`]
  if (!compat || compat.status === "incompatible") {
    throw new IncompatibleWorkflowProviderError(
      `Workflow '${workflow.id}' incompatible with ${model.providerId}:${model.id}`,
      {
        workflowId: workflow.id,
        providerId: model.providerId,
        modelId: model.id,
        reason: compat?.reason,
      },
    )
  }

  // #6 — runtime aspect-ratio + language validation against model capability.
  const runtime = validateRuntime({
    capability: model.capability,
    aspectRatio: params.aspectRatio,
    ...(params.language !== undefined ? { language: params.language } : {}),
  })
  if (!runtime.ok) {
    throw new RuntimeValidationError(runtime.message, {
      code: runtime.code,
      modelId: model.id,
    })
  }

  // #7 — input MUST NOT carry aspectRatio/language (top-level run params).
  if (typeof params.input === "object" && params.input !== null && !Array.isArray(params.input)) {
    const record = params.input as Record<string, unknown>
    for (const banned of BANNED_INPUT_KEYS) {
      if (banned in record) {
        throw new BadRequestError(
          `Workflow input must not declare '${banned}' (top-level run param)`,
          { offendingKey: banned, workflowId: workflow.id },
        )
      }
    }
  }

  // #8 — workflow-specific input shape. ZodError bubbles → 400 via middleware.
  const parsedInput = workflow.inputSchema.parse(params.input)

  return { workflow, profile, model, parsedInput }
}
