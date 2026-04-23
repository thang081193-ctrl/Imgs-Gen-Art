// Phase 4 Step 5 (Session #21) — finalizeBatch helper.
//
// Aggregates cost_usd from all persisted assets in a batch, writes totals
// onto the batch row via batchRepo.updateStatus. The 4 workflow unit tests
// exercise it end-to-end, but this suite pins the helper's contract in
// isolation against a real in-memory SQLite so the math is trusted.

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  _resetAssetStoreForTests,
  finalizeBatch,
  getAssetRepo,
  getBatchRepo,
  initAssetStore,
  type AssetInsertInput,
} from "@/server/asset-store"

function seedAsset(overrides: Partial<AssetInsertInput> = {}): AssetInsertInput {
  const base: AssetInsertInput = {
    id: `ast_${Math.random().toString(36).slice(2, 10)}`,
    profileId: "p1",
    profileVersionAtGen: 1,
    workflowId: "artwork-batch",
    batchId: "b1",
    promptRaw: "test",
    inputParams: "{}",
    replayClass: "best_effort",
    providerId: "mock",
    modelId: "mock-fast",
    aspectRatio: "1:1",
    filePath: "/tmp/x.png",
    width: 100,
    height: 100,
    fileSizeBytes: 1,
    status: "completed",
    generationTimeMs: 10,
    costUsd: 0.1,
    tags: [],
    createdAt: "2026-04-23T00:00:00.000Z",
  }
  return { ...base, ...overrides }
}

describe("finalizeBatch", () => {
  beforeEach(() => {
    _resetAssetStoreForTests()
    initAssetStore({ path: ":memory:" })
  })
  afterEach(() => _resetAssetStoreForTests())

  it("aggregates cost_usd from completed assets, skipping error rows", () => {
    const assetRepo = getAssetRepo()
    const batchRepo = getBatchRepo()

    batchRepo.create({
      id: "b1",
      profileId: "p1",
      workflowId: "artwork-batch",
      totalAssets: 3,
      status: "running",
      startedAt: "2026-04-23T00:00:00.000Z",
    })
    assetRepo.insert(seedAsset({ id: "a1", costUsd: 0.067 }))
    assetRepo.insert(seedAsset({ id: "a2", costUsd: 0.134 }))
    // error status — must NOT be included in cost total
    assetRepo.insert(
      seedAsset({ id: "a3", costUsd: 0.5, status: "error", errorMessage: "boom" }),
    )

    const result = finalizeBatch({
      batchId: "b1",
      status: "completed",
      assetRepo,
      batchRepo,
      at: "2026-04-23T00:01:00.000Z",
    })

    expect(result.totalAssets).toBe(3)
    expect(result.successfulAssets).toBe(2)
    expect(result.totalCostUsd).toBeCloseTo(0.201, 5)

    const batch = batchRepo.findById("b1")
    expect(batch?.status).toBe("completed")
    expect(batch?.successfulAssets).toBe(2)
    expect(batch?.totalCostUsd).toBeCloseTo(0.201, 5)
    expect(batch?.completedAt).toBe("2026-04-23T00:01:00.000Z")
    expect(batch?.abortedAt).toBeNull()
  })

  it("stamps abortedAt (not completedAt) when status='aborted'", () => {
    const assetRepo = getAssetRepo()
    const batchRepo = getBatchRepo()
    batchRepo.create({
      id: "b2",
      profileId: "p1",
      workflowId: "ad-production",
      totalAssets: 2,
      status: "running",
      startedAt: "2026-04-23T00:00:00.000Z",
    })
    assetRepo.insert(seedAsset({ id: "a1", batchId: "b2", costUsd: 0.067 }))

    finalizeBatch({
      batchId: "b2",
      status: "aborted",
      assetRepo,
      batchRepo,
      at: "2026-04-23T00:00:30.000Z",
    })

    const batch = batchRepo.findById("b2")
    expect(batch?.status).toBe("aborted")
    expect(batch?.abortedAt).toBe("2026-04-23T00:00:30.000Z")
    expect(batch?.completedAt).toBeNull()
    expect(batch?.totalCostUsd).toBeCloseTo(0.067, 5)
  })

  it("empty batch → zero cost + zero successful", () => {
    const assetRepo = getAssetRepo()
    const batchRepo = getBatchRepo()
    batchRepo.create({
      id: "empty",
      profileId: "p1",
      workflowId: "artwork-batch",
      totalAssets: 0,
      status: "running",
      startedAt: "2026-04-23T00:00:00.000Z",
    })

    const result = finalizeBatch({
      batchId: "empty",
      status: "completed",
      assetRepo,
      batchRepo,
      at: "2026-04-23T00:00:05.000Z",
    })

    expect(result.totalAssets).toBe(0)
    expect(result.successfulAssets).toBe(0)
    expect(result.totalCostUsd).toBe(0)

    const batch = batchRepo.findById("empty")
    expect(batch?.totalCostUsd).toBe(0)
  })

  it("handles null cost_usd defensively (legacy rows stamped before migration)", () => {
    const assetRepo = getAssetRepo()
    const batchRepo = getBatchRepo()
    batchRepo.create({
      id: "b3",
      profileId: "p1",
      workflowId: "artwork-batch",
      totalAssets: 2,
      status: "running",
      startedAt: "2026-04-23T00:00:00.000Z",
    })
    // Treat undefined in the insert input — repo maps to null.
    assetRepo.insert(seedAsset({ id: "a1", batchId: "b3" } as Partial<AssetInsertInput>))
    assetRepo.insert(seedAsset({ id: "a2", batchId: "b3", costUsd: 0.134 }))

    const result = finalizeBatch({
      batchId: "b3",
      status: "completed",
      assetRepo,
      batchRepo,
      at: "2026-04-23T00:01:00.000Z",
    })

    // a1 gets the seedAsset default 0.1; a2 is 0.134 → 0.234
    expect(result.totalCostUsd).toBeCloseTo(0.234, 5)
  })
})
