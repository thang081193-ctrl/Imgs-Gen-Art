// BOOTSTRAP-PHASE3 Step 2 — unit tests for checkPreconditions().
//
// Each branch of PLAN §6.4 preconditions 1-8 covered with stubbed deps so
// we don't touch the real profile-repo / keys store / workflow registry.

import { describe, expect, it } from "vitest"
import { z } from "zod"

import type { WorkflowRequirement } from "@/core/compatibility/types"
import { ALL_MODELS, MODEL_IDS } from "@/core/model-registry/models"
import type { ModelInfo } from "@/core/model-registry/types"
import type { AppProfile } from "@/core/schemas/app-profile"
import {
  BadRequestError,
  IncompatibleWorkflowProviderError,
  NoActiveKeyError,
  NotFoundError,
  RuntimeValidationError,
} from "@/core/shared/errors"
import {
  checkPreconditions,
  type PreconditionDeps,
  type PreconditionParams,
} from "@/server/workflows-runtime/precondition-check"
import type { WorkflowDefinition, WorkflowEvent } from "@/workflows"

// ---------- fixtures ----------

const requirement: WorkflowRequirement = {
  required: ["supportsTextToImage"],
  preferred: [],
}

const stubWorkflow: WorkflowDefinition = {
  id: "artwork-batch",
  displayName: "Artwork Batch (stub)",
  description: "test stub",
  colorVariant: "violet",
  requirement,
  compatibilityOverrides: [],
  inputSchema: z.object({ subject: z.string().min(1) }).strict(),
  // eslint-disable-next-line require-yield
  async *run(): AsyncGenerator<WorkflowEvent> {
    return
  },
}

const stubProfile: AppProfile = {
  version: 1,
  id: "stub-profile",
  name: "Stub",
  tagline: "stub",
  category: "utility",
  assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
  visual: {
    primaryColor: "#000000",
    secondaryColor: "#111111",
    accentColor: "#222222",
    tone: "minimal",
    doList: [],
    dontList: [],
  },
  positioning: {
    usp: "u",
    targetPersona: "t",
    marketTier: "global",
  },
  context: {
    features: [],
    keyScenarios: [],
    forbiddenContent: [],
  },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
} as AppProfile

const mockModel = ALL_MODELS.find((m) => m.id === MODEL_IDS.MOCK_FAST)!

function baseParams(overrides: Partial<PreconditionParams> = {}): PreconditionParams {
  return {
    workflowId: "artwork-batch",
    profileId: "stub-profile",
    providerId: "mock",
    modelId: MODEL_IDS.MOCK_FAST,
    aspectRatio: "1:1",
    input: { subject: "test" },
    ...overrides,
  }
}

function baseDeps(overrides: Partial<PreconditionDeps> = {}): PreconditionDeps {
  return {
    getWorkflow: () => stubWorkflow,
    loadProfile: () => stubProfile,
    resolveModel: (id: string) => ALL_MODELS.find((m) => m.id === id),
    hasActiveKey: () => true,
    ...overrides,
  }
}

// ---------- tests ----------

describe("checkPreconditions — happy path", () => {
  it("returns hydrated workflow/profile/model/parsedInput on full pass", async () => {
    const result = await checkPreconditions(baseParams(), baseDeps())
    expect(result.workflow.id).toBe("artwork-batch")
    expect(result.profile.id).toBe("stub-profile")
    expect(result.model.id).toBe(MODEL_IDS.MOCK_FAST)
    expect(result.parsedInput).toEqual({ subject: "test" })
  })
})

describe("checkPreconditions — precondition #1 workflow exists", () => {
  it("throws NotFoundError when workflow id unknown", async () => {
    const deps = baseDeps({
      getWorkflow: () => {
        throw new NotFoundError("Workflow 'x' not found")
      },
    })
    await expect(checkPreconditions(baseParams(), deps)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("checkPreconditions — precondition #2 profile exists", () => {
  it("propagates NotFoundError from profile repo", async () => {
    const deps = baseDeps({
      loadProfile: () => {
        throw new NotFoundError("Profile 'missing' not found")
      },
    })
    await expect(checkPreconditions(baseParams(), deps)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("checkPreconditions — precondition #3 model exists + provider match", () => {
  it("throws BadRequestError for unknown modelId", async () => {
    const deps = baseDeps({ resolveModel: () => undefined })
    await expect(checkPreconditions(baseParams(), deps)).rejects.toBeInstanceOf(BadRequestError)
  })

  it("throws BadRequestError when providerId does not match model's owning provider", async () => {
    const params = baseParams({ providerId: "gemini" })
    await expect(checkPreconditions(params, baseDeps())).rejects.toThrow(/belongs to provider/)
  })
})

describe("checkPreconditions — precondition #4 active key", () => {
  it("throws NoActiveKeyError when hasActiveKey returns false", async () => {
    const deps = baseDeps({ hasActiveKey: () => false })
    await expect(checkPreconditions(baseParams(), deps)).rejects.toBeInstanceOf(NoActiveKeyError)
  })
})

describe("checkPreconditions — precondition #5 compatibility matrix", () => {
  it("throws IncompatibleWorkflowProviderError when forbidden capability present", async () => {
    // Mock has every capability, so assert via `forbidden` — the surest
    // way to force declarative incompatibility without narrowing the model.
    const impossibleReq: WorkflowRequirement = {
      required: [],
      preferred: [],
      forbidden: ["supportsTextToImage"],
    }
    const unfriendlyWorkflow: WorkflowDefinition = {
      ...stubWorkflow,
      requirement: impossibleReq,
    }
    const deps = baseDeps({ getWorkflow: () => unfriendlyWorkflow })
    await expect(checkPreconditions(baseParams(), deps)).rejects.toBeInstanceOf(
      IncompatibleWorkflowProviderError,
    )
  })

  it("accepts a compatibilityOverride that forces compatible", async () => {
    const impossibleReq: WorkflowRequirement = {
      required: ["supportsCharacterConsistency"],
      preferred: [],
    }
    const wf: WorkflowDefinition = {
      ...stubWorkflow,
      requirement: impossibleReq,
      compatibilityOverrides: [
        {
          providerId: "mock",
          modelId: MODEL_IDS.MOCK_FAST,
          forceStatus: "compatible",
          reason: "test override",
        },
      ],
    }
    const deps = baseDeps({ getWorkflow: () => wf })
    const result = await checkPreconditions(baseParams(), deps)
    expect(result.model.id).toBe(MODEL_IDS.MOCK_FAST)
  })
})

describe("checkPreconditions — precondition #6 runtime validation", () => {
  it("throws RuntimeValidationError when aspectRatio unsupported by model", async () => {
    const narrowModel: ModelInfo = {
      ...mockModel,
      capability: { ...mockModel.capability, supportedAspectRatios: ["1:1"] },
    }
    const deps = baseDeps({ resolveModel: () => narrowModel })
    const params = baseParams({ aspectRatio: "21:9" })
    await expect(checkPreconditions(params, deps)).rejects.toBeInstanceOf(RuntimeValidationError)
  })

  it("throws RuntimeValidationError when language unsupported", async () => {
    const narrowModel: ModelInfo = {
      ...mockModel,
      capability: { ...mockModel.capability, supportedLanguages: ["en"] },
    }
    const deps = baseDeps({ resolveModel: () => narrowModel })
    const params = baseParams({ language: "vi" })
    await expect(checkPreconditions(params, deps)).rejects.toBeInstanceOf(RuntimeValidationError)
  })
})

describe("checkPreconditions — precondition #7 banned input keys", () => {
  it("throws BadRequestError when input carries aspectRatio", async () => {
    const params = baseParams({ input: { subject: "x", aspectRatio: "1:1" } })
    await expect(checkPreconditions(params, baseDeps())).rejects.toThrow(/aspectRatio/)
  })

  it("throws BadRequestError when input carries language", async () => {
    const params = baseParams({ input: { subject: "x", language: "vi" } })
    await expect(checkPreconditions(params, baseDeps())).rejects.toThrow(/language/)
  })
})

describe("checkPreconditions — precondition #8 workflow input schema", () => {
  it("propagates ZodError on shape mismatch", async () => {
    const params = baseParams({ input: { subject: 123 } })
    await expect(checkPreconditions(params, baseDeps())).rejects.toThrow()
  })

  it("propagates ZodError on missing required field", async () => {
    const params = baseParams({ input: {} })
    await expect(checkPreconditions(params, baseDeps())).rejects.toThrow()
  })
})
