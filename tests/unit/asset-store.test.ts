// Integration-shaped unit tests for the asset-store module.
// Covers: DB boot (WAL + FK pragmas), schema application via runner,
// asset-repo CRUD stubs, batch-repo stubs, and Rule 11 DTO stripping.

import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  openAssetDatabase,
  createAssetRepo,
  createBatchRepo,
  toAssetDto,
  type AssetInsertInput,
} from "@/server/asset-store"

function openMemory() {
  return openAssetDatabase({ path: ":memory:" })
}

const baseAsset = (
  overrides: Partial<AssetInsertInput> & Pick<AssetInsertInput, "id">,
): AssetInsertInput => ({
  profileId: "chartlens",
  profileVersionAtGen: 1,
  workflowId: "artwork-batch",
  promptRaw: "a sample prompt",
  inputParams: "{}",
  replayClass: "best_effort",
  providerId: "mock",
  modelId: "mock-fast",
  aspectRatio: "1:1",
  filePath: `./data/assets/${overrides.id}.png`,
  status: "completed",
  ...overrides,
})

describe("openAssetDatabase — boot", () => {
  it("applies the initial migration and enables WAL + FK on a real file", () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-db-"))
    const path = join(dir, "test.db")
    try {
      const { db, migrations } = openAssetDatabase({ path })
      expect(migrations.applied).toContain("2026-04-20-initial.sql")
      expect(db.pragma("journal_mode", { simple: true })).toBe("wal")
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1)
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("creates assets, batches, profile_assets tables (PLAN §5.3)", () => {
    const { db } = openMemory()
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain("assets")
    expect(names).toContain("batches")
    expect(names).toContain("profile_assets")
    expect(names).toContain("_migrations")
  })

  it("assets table has the nullable replay_payload + language columns (v2.2)", () => {
    const { db } = openMemory()
    const cols = db.prepare(`PRAGMA table_info(assets)`).all() as Array<{
      name: string
      notnull: number
    }>
    const byName = new Map(cols.map((c) => [c.name, c]))
    expect(byName.get("replay_payload")?.notnull).toBe(0)
    expect(byName.get("language")?.notnull).toBe(0)
    expect(byName.get("batch_id")?.notnull).toBe(0)
  })
})

describe("asset-repo — insert / findById / findByBatch / list", () => {
  it("insert + findById round-trip", () => {
    const { db } = openMemory()
    const repo = createAssetRepo(db)
    const asset = repo.insert(baseAsset({ id: "asset_a1" }))
    expect(asset.id).toBe("asset_a1")
    expect(asset.tags).toEqual([])
    expect(asset.batchId).toBeNull()
    expect(asset.seed).toBeNull()
    expect(asset.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const round = repo.findById("asset_a1")
    expect(round).toEqual(asset)
  })

  it("findById returns null when missing", () => {
    const { db } = openMemory()
    const repo = createAssetRepo(db)
    expect(repo.findById("does-not-exist")).toBeNull()
  })

  it("findByBatch returns only matching rows, ordered by created_at ASC", () => {
    const { db } = openMemory()
    const batches = createBatchRepo(db)
    batches.create({
      id: "batch_x",
      profileId: "chartlens",
      workflowId: "artwork-batch",
      totalAssets: 2,
      status: "running",
    })
    const repo = createAssetRepo(db)
    repo.insert(baseAsset({ id: "asset_1", batchId: "batch_x", createdAt: "2026-04-21T10:00:00.000Z" }))
    repo.insert(baseAsset({ id: "asset_2", batchId: "batch_x", createdAt: "2026-04-21T10:00:01.000Z" }))
    repo.insert(baseAsset({ id: "asset_other", createdAt: "2026-04-21T10:00:02.000Z" }))

    const rows = repo.findByBatch("batch_x")
    expect(rows.map((r) => r.id)).toEqual(["asset_1", "asset_2"])
  })

  it("list respects profileId + workflowId filters + limit/offset", () => {
    const { db } = openMemory()
    const repo = createAssetRepo(db)
    repo.insert(baseAsset({ id: "a1", profileId: "chartlens",   workflowId: "artwork-batch", createdAt: "2026-04-21T10:00:00Z" }))
    repo.insert(baseAsset({ id: "a2", profileId: "chartlens",   workflowId: "artwork-batch", createdAt: "2026-04-21T10:00:01Z" }))
    repo.insert(baseAsset({ id: "a3", profileId: "chartlens",   workflowId: "aso-screenshots", createdAt: "2026-04-21T10:00:02Z" }))
    repo.insert(baseAsset({ id: "a4", profileId: "plant-identifier", workflowId: "artwork-batch", createdAt: "2026-04-21T10:00:03Z" }))

    const byProfile = repo.list({ profileIds: ["chartlens"], limit: 10 })
    expect(byProfile.map((r) => r.id)).toEqual(["a3", "a2", "a1"])

    const byProfileAndWorkflow = repo.list({
      profileIds: ["chartlens"],
      workflowIds: ["artwork-batch"],
      limit: 10,
    })
    expect(byProfileAndWorkflow.map((r) => r.id)).toEqual(["a2", "a1"])

    const paginated = repo.list({ limit: 2, offset: 1 })
    expect(paginated).toHaveLength(2)
    expect(paginated.map((r) => r.id)).toEqual(["a3", "a2"])
  })

  it("insert persists tags JSON roundtrip", () => {
    const { db } = openMemory()
    const repo = createAssetRepo(db)
    const asset = repo.insert(baseAsset({ id: "asset_tags", tags: ["hero", "dark-mode"] }))
    expect(asset.tags).toEqual(["hero", "dark-mode"])
    const round = repo.findById("asset_tags")
    expect(round?.tags).toEqual(["hero", "dark-mode"])
  })
})

describe("batch-repo — create / findById", () => {
  it("create + findById round-trip", () => {
    const { db } = openMemory()
    const repo = createBatchRepo(db)
    const batch = repo.create({
      id: "batch_y",
      profileId: "chartlens",
      workflowId: "artwork-batch",
      totalAssets: 5,
      status: "running",
    })
    expect(batch.id).toBe("batch_y")
    expect(batch.successfulAssets).toBe(0)
    expect(batch.completedAt).toBeNull()
    expect(batch.abortedAt).toBeNull()

    const round = repo.findById("batch_y")
    expect(round).toEqual(batch)
  })

  it("findById returns null when missing", () => {
    const { db } = openMemory()
    const repo = createBatchRepo(db)
    expect(repo.findById("nope")).toBeNull()
  })
})

describe("batch-repo — updateStatus (Phase 3)", () => {
  const seed = (db: ReturnType<typeof openMemory>["db"]) => {
    const repo = createBatchRepo(db)
    repo.create({
      id: "batch_u",
      profileId: "chartlens",
      workflowId: "artwork-batch",
      totalAssets: 3,
      status: "running",
    })
    return repo
  }

  it("transitions to completed + stamps completedAt + updates counters", () => {
    const { db } = openMemory()
    const repo = seed(db)
    const updated = repo.updateStatus("batch_u", {
      status: "completed",
      successfulAssets: 3,
      totalCostUsd: 0,
      completedAt: "2026-04-22T10:00:00.000Z",
    })
    expect(updated.status).toBe("completed")
    expect(updated.successfulAssets).toBe(3)
    expect(updated.totalCostUsd).toBe(0)
    expect(updated.completedAt).toBe("2026-04-22T10:00:00.000Z")
    expect(updated.abortedAt).toBeNull()
  })

  it("transitions to aborted + stamps abortedAt + partial successfulAssets", () => {
    const { db } = openMemory()
    const repo = seed(db)
    const updated = repo.updateStatus("batch_u", {
      status: "aborted",
      successfulAssets: 1,
      abortedAt: "2026-04-22T10:00:05.000Z",
    })
    expect(updated.status).toBe("aborted")
    expect(updated.successfulAssets).toBe(1)
    expect(updated.abortedAt).toBe("2026-04-22T10:00:05.000Z")
    expect(updated.completedAt).toBeNull()
  })

  it("transitions to error without requiring either timestamp", () => {
    const { db } = openMemory()
    const repo = seed(db)
    const updated = repo.updateStatus("batch_u", { status: "error" })
    expect(updated.status).toBe("error")
    expect(updated.completedAt).toBeNull()
    expect(updated.abortedAt).toBeNull()
  })

  it("throws when transitioning to completed without completedAt", () => {
    const { db } = openMemory()
    const repo = seed(db)
    expect(() =>
      repo.updateStatus("batch_u", { status: "completed", successfulAssets: 3 }),
    ).toThrow(/completedAt required/)
  })

  it("throws when transitioning to aborted without abortedAt", () => {
    const { db } = openMemory()
    const repo = seed(db)
    expect(() =>
      repo.updateStatus("batch_u", { status: "aborted" }),
    ).toThrow(/abortedAt required/)
  })

  it("throws when batchId unknown", () => {
    const { db } = openMemory()
    const repo = seed(db)
    expect(() =>
      repo.updateStatus("batch_missing", {
        status: "completed",
        completedAt: "2026-04-22T10:00:00.000Z",
      }),
    ).toThrow(/unknown batch id/)
  })
})

describe("Rule 11 — toAssetDto strips filePath, adds opaque imageUrl", () => {
  it("DTO has no filePath key, no disk path in serialized JSON, imageUrl = /api/assets/{id}/file", () => {
    const { db } = openMemory()
    const repo = createAssetRepo(db)
    const asset = repo.insert(baseAsset({ id: "asset_dto" }))
    const dto = toAssetDto(asset)

    expect(Object.prototype.hasOwnProperty.call(dto, "filePath")).toBe(false)
    const json = JSON.stringify(dto)
    expect(json).not.toContain("./data/")
    expect(json).not.toContain("filePath")
    expect(dto.imageUrl).toBe(`/api/assets/${asset.id}/file`)
  })
})
