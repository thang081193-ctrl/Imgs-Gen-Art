// Phase 5 Step 1 (Session #25) — replay-service unit tests.
//
// Exercises loadReplayContext preconditions (4 of them per Q1 spec) and
// executeReplay happy/abort/error paths with injected deps (no global
// context — each test owns its own in-memory DB + tmp assets dir).
// Determinism test: Mock provider output depends only on prompt, so two
// replays of the same asset produce byte-identical PNGs — this is the
// "deterministic" replay class contract.

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ModelInfo } from "@/core/model-registry/types"
import { getModel } from "@/core/model-registry/models"
import type { AppProfile } from "@/core/schemas/app-profile"
import type { ReplayPayload } from "@/core/schemas/replay-payload"
import {
  BadRequestError,
  CapabilityNotSupportedError,
  MalformedPayloadError,
  NoActiveKeyError,
  NotFoundError,
} from "@/core/shared/errors"
import {
  createAssetRepo,
  createBatchRepo,
  openAssetDatabase,
  type AssetInsertInput,
  type AssetRepo,
  type BatchRepo,
} from "@/server/asset-store"
import { mockProvider } from "@/server/providers/mock"
import {
  executeReplay,
  loadReplayContext,
} from "@/server/workflows-runtime/replay-service"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"

const MOCK_MODEL_ID = "mock-fast"

function openDbPair(): { assetRepo: AssetRepo; batchRepo: BatchRepo; close: () => void } {
  const { db } = openAssetDatabase({ path: ":memory:" })
  return {
    assetRepo: createAssetRepo(db),
    batchRepo: createBatchRepo(db),
    close: () => db.close(),
  }
}

function seedSourceAsset(
  assetRepo: AssetRepo,
  batchRepo: BatchRepo,
  overrides: Partial<AssetInsertInput> = {},
): string {
  const id = overrides.id ?? "asset_src001"
  const sourceBatchId = overrides.batchId ?? "batch_src"
  // FK constraint: assets.batch_id → batches.id; seed the parent batch first
  // (happy path + replayOfBatchId assertion depends on the link being real).
  if (sourceBatchId !== null && !batchRepo.findById(sourceBatchId)) {
    batchRepo.create({
      id: sourceBatchId,
      profileId: "chartlens",
      workflowId: "artwork-batch",
      totalAssets: 1,
      successfulAssets: 1,
      status: "completed",
    })
  }
  const payload = {
    version: 1,
    promptRaw: "a serene mountain lake at sunrise",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    seed: 42,
    aspectRatio: "1:1" as const,
    language: null,
  }
  assetRepo.insert({
    id,
    profileId: "chartlens",
    profileVersionAtGen: 1,
    workflowId: "artwork-batch",
    batchId: sourceBatchId,
    promptRaw: payload.promptRaw,
    inputParams: "{}",
    replayPayload: JSON.stringify(payload),
    replayClass: "deterministic",
    providerId: "mock",
    modelId: MOCK_MODEL_ID,
    seed: 42,
    aspectRatio: "1:1",
    filePath: `./data/assets/${id}.png`,
    status: "completed",
    tags: ["memory"],
    ...overrides,
  })
  return id
}

async function drain(
  gen: AsyncGenerator<WorkflowEvent>,
): Promise<WorkflowEvent[]> {
  const events: WorkflowEvent[] = []
  for await (const e of gen) events.push(e)
  return events
}

let tmpAssetsDir: string
let closeDb: (() => void) | null = null

beforeEach(() => {
  tmpAssetsDir = mkdtempSync(join(tmpdir(), "igart-replay-"))
})

afterEach(() => {
  if (closeDb) {
    closeDb()
    closeDb = null
  }
  rmSync(tmpAssetsDir, { recursive: true, force: true })
})

describe("loadReplayContext — preconditions", () => {
  it("throws NotFoundError when asset does not exist", () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    expect(() => loadReplayContext("no-such-asset", { assetRepo })).toThrow(
      NotFoundError,
    )
  })

  it("throws BadRequestError when replayClass is 'not_replayable'", () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    seedSourceAsset(assetRepo, batchRepo, { id: "asset_nr", replayClass: "not_replayable" })
    expect(() => loadReplayContext("asset_nr", { assetRepo })).toThrow(BadRequestError)
  })

  it("throws BadRequestError when replayPayload is null", () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    seedSourceAsset(assetRepo, batchRepo, { id: "asset_np", replayPayload: null })
    expect(() => loadReplayContext("asset_np", { assetRepo })).toThrow(BadRequestError)
  })

  it("throws BadRequestError when replayPayload JSON is malformed", () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    seedSourceAsset(assetRepo, batchRepo, { id: "asset_bad", replayPayload: "{not-json" })
    expect(() => loadReplayContext("asset_bad", { assetRepo })).toThrow(BadRequestError)
  })

  it("throws MalformedPayloadError when stored shape matches neither canonical nor legacy", () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    seedSourceAsset(assetRepo, batchRepo, {
      id: "asset_shape",
      replayPayload: JSON.stringify({ version: 1 }),
    })
    expect(() => loadReplayContext("asset_shape", { assetRepo })).toThrow(
      MalformedPayloadError,
    )
  })

  it("throws NoActiveKeyError when hasActiveKey returns false", () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    seedSourceAsset(assetRepo, batchRepo)
    expect(() =>
      loadReplayContext("asset_src001", {
        assetRepo,
        hasActiveKey: () => false,
      }),
    ).toThrow(NoActiveKeyError)
  })

  it("returns hydrated context on success (mock always has key)", () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    seedSourceAsset(assetRepo, batchRepo)
    const ctx = loadReplayContext("asset_src001", { assetRepo })
    expect(ctx.sourceAsset.id).toBe("asset_src001")
    expect(ctx.model.id).toBe(MOCK_MODEL_ID)
    expect(ctx.execute.prompt).toBe("a serene mountain lake at sunrise")
    expect(ctx.execute.seed).toBe(42)
    expect(ctx.kind).toBe("legacy")
  })
})

describe("executeReplay — happy path", () => {
  it("emits started → image_generated → complete + creates replay batch linked to source", async () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    const sourceId = seedSourceAsset(assetRepo, batchRepo)

    const events = await drain(
      executeReplay(
        {
          assetId: sourceId,
          newBatchId: "batch_rp001",
          abortSignal: new AbortController().signal,
        },
        {
          assetRepo,
          batchRepo,
          resolveProvider: () => mockProvider,
          assetsDir: tmpAssetsDir,
        },
      ),
    )

    const types = events.map((e) => e.type)
    expect(types).toEqual(["started", "image_generated", "complete"])

    const batch = batchRepo.findById("batch_rp001")
    expect(batch?.status).toBe("completed")
    expect(batch?.successfulAssets).toBe(1)
    expect(batch?.replayOfBatchId).toBe("batch_src")
    expect(batch?.replayOfAssetId).toBe(sourceId)

    const imageEv = events[1] as Extract<WorkflowEvent, { type: "image_generated" }>
    expect(imageEv.asset.replayedFromAssetId).toBe(sourceId)
    expect(imageEv.asset.batchId).toBe("batch_rp001")
    expect(imageEv.asset.seed).toBe(42)
  })

  it("produces byte-identical output on repeat replay (determinism contract)", async () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    const sourceId = seedSourceAsset(assetRepo, batchRepo)

    async function runOnce(batchId: string): Promise<string> {
      const events = await drain(
        executeReplay(
          {
            assetId: sourceId,
            newBatchId: batchId,
            abortSignal: new AbortController().signal,
          },
          {
            assetRepo,
            batchRepo,
            resolveProvider: () => mockProvider,
            assetsDir: tmpAssetsDir,
          },
        ),
      )
      const imageEv = events.find((e) => e.type === "image_generated") as
        | Extract<WorkflowEvent, { type: "image_generated" }>
        | undefined
      if (!imageEv) throw new Error("no image_generated event")
      return imageEv.asset.id
    }

    const idA = await runOnce("batch_det_a")
    const idB = await runOnce("batch_det_b")

    const rowA = assetRepo.findById(idA)
    const rowB = assetRepo.findById(idB)
    if (!rowA || !rowB) throw new Error("asset row missing")

    const bytesA = readFileSync(rowA.filePath)
    const bytesB = readFileSync(rowB.filePath)
    expect(bytesA.equals(bytesB)).toBe(true)
  })
})

describe("executeReplay — abort handling", () => {
  it("emits started → aborted when abortSignal fires before provider.generate()", async () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    const sourceId = seedSourceAsset(assetRepo, batchRepo)

    const ctrl = new AbortController()
    ctrl.abort()

    const events = await drain(
      executeReplay(
        {
          assetId: sourceId,
          newBatchId: "batch_ab",
          abortSignal: ctrl.signal,
        },
        {
          assetRepo,
          batchRepo,
          resolveProvider: () => mockProvider,
          assetsDir: tmpAssetsDir,
        },
      ),
    )

    const types = events.map((e) => e.type)
    expect(types[0]).toBe("started")
    expect(types.at(-1)).toBe("aborted")

    const batch = batchRepo.findById("batch_ab")
    expect(batch?.status).toBe("aborted")
  })
})

describe("executeReplay — mode=edit capability gate (Session #27a)", () => {
  const canonicalProfile: AppProfile = {
    version: 1,
    id: "chartlens",
    name: "ChartLens",
    tagline: "Instant chart reader",
    category: "utility",
    assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
    visual: {
      primaryColor: "#111111",
      secondaryColor: "#ff66cc",
      accentColor: "#00ccff",
      tone: "minimal",
      doList: ["a"],
      dontList: ["b"],
    },
    positioning: { usp: "x", targetPersona: "y", marketTier: "global" },
    context: { features: [], keyScenarios: [], forbiddenContent: [] },
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  }

  function seedCanonical(assetRepo: AssetRepo, batchRepo: BatchRepo): string {
    const batchId = "batch_cap_src"
    batchRepo.create({
      id: batchId,
      profileId: "chartlens",
      workflowId: "artwork-batch",
      totalAssets: 1,
      successfulAssets: 1,
      status: "completed",
    })
    const canonical: ReplayPayload = {
      version: 1,
      prompt: "foo",
      providerId: "mock",
      modelId: MOCK_MODEL_ID,
      aspectRatio: "1:1",
      seed: 1,
      providerSpecificParams: { addWatermark: false },
      promptTemplateId: "artwork-batch",
      promptTemplateVersion: "1",
      contextSnapshot: {
        profileId: canonicalProfile.id,
        profileVersion: canonicalProfile.version,
        profileSnapshot: canonicalProfile,
      },
    }
    const id = "asset_cap_src"
    assetRepo.insert({
      id,
      profileId: "chartlens",
      profileVersionAtGen: 1,
      workflowId: "artwork-batch",
      batchId,
      promptRaw: canonical.prompt,
      promptTemplateId: canonical.promptTemplateId,
      promptTemplateVersion: canonical.promptTemplateVersion,
      inputParams: "{}",
      replayPayload: JSON.stringify(canonical),
      replayClass: "deterministic",
      providerId: "mock",
      modelId: MOCK_MODEL_ID,
      seed: 1,
      aspectRatio: "1:1",
      filePath: `./data/assets/${id}.png`,
      status: "completed",
      tags: [],
    })
    return id
  }

  it("throws CapabilityNotSupportedError when overridePayload.negativePrompt targets a model without supportsNegativePrompt", async () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    const sourceId = seedCanonical(assetRepo, batchRepo)
    const baseModel = getModel(MOCK_MODEL_ID)
    if (!baseModel) throw new Error("mock model missing from registry")
    const capped: ModelInfo = {
      ...baseModel,
      capability: { ...baseModel.capability, supportsNegativePrompt: false },
    }

    await expect(async () => {
      for await (const _evt of executeReplay(
        {
          assetId: sourceId,
          newBatchId: "batch_cap_attempt",
          abortSignal: new AbortController().signal,
          overridePayload: { negativePrompt: "disallowed" },
        },
        {
          assetRepo,
          batchRepo,
          resolveModel: (id) => (id === MOCK_MODEL_ID ? capped : getModel(id)),
          assetsDir: tmpAssetsDir,
        },
      )) {
        // drain
      }
    }).rejects.toBeInstanceOf(CapabilityNotSupportedError)
  })
})

describe("executeReplay — provider error", () => {
  it("yields error + complete when provider.generate throws", async () => {
    const { assetRepo, batchRepo, close } = openDbPair()
    closeDb = close
    const sourceId = seedSourceAsset(assetRepo, batchRepo)

    const throwingProvider = {
      ...mockProvider,
      generate: async () => {
        throw new Error("boom")
      },
    }

    const events = await drain(
      executeReplay(
        {
          assetId: sourceId,
          newBatchId: "batch_err",
          abortSignal: new AbortController().signal,
        },
        {
          assetRepo,
          batchRepo,
          resolveProvider: () => throwingProvider,
          resolveModel: (id): ModelInfo | undefined => getModel(id),
          assetsDir: tmpAssetsDir,
        },
      ),
    )

    const types = events.map((e) => e.type)
    expect(types).toContain("error")
    expect(types.at(-1)).toBe("complete")

    const batch = batchRepo.findById("batch_err")
    expect(batch?.status).toBe("error")
  })
})
