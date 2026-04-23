// BOOTSTRAP-PHASE3 Step 3 — unit tests for the artwork-batch workflow.
//
// Three groups: concept-generator purity, prompt-builder composition,
// and runner event stream (happy path + pre/mid-flight abort + schema rejection).

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import type { AppProfile } from "@/core/schemas/app-profile"
import { openAssetDatabase } from "@/server/asset-store/db"
import { createAssetRepo } from "@/server/asset-store/asset-repo"
import { createBatchRepo } from "@/server/asset-store/batch-repo"
import { mockProvider } from "@/server/providers/mock"
import {
  ArtworkBatchInputSchema,
  buildPrompt,
  createArtworkBatchRun,
  deriveSeed,
  generateConcepts,
  pickConcepts,
} from "@/workflows/artwork-batch"
import type { WorkflowRunParams } from "@/workflows/types"
import type { ArtworkGroupsFile } from "@/core/templates"

// ---------- fixtures ----------

const pool = ["Family", "Wedding", "Anniversary", "Graduation", "Portrait", "Pet", "Landscape", "Retro"]

const templatesFixture: ArtworkGroupsFile = {
  schemaVersion: 1,
  groups: {
    memory: pool,
    cartoon: ["Anime", "Chibi"],
    aiArt: ["Cyberpunk"],
    festive: ["Lunar"],
    xmas: ["Santa"],
    baby: ["Newborn"],
    avatar: ["Pixel"],
    allInOne: ["Multi"],
  },
}

const profile: AppProfile = {
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
    doList: ["clean grid", "soft shadows"],
    dontList: ["clutter"],
  },
  positioning: {
    usp: "Snap a chart, get insights.",
    targetPersona: "traders",
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

function fixedClock(): () => Date {
  const stamp = new Date("2026-04-22T10:00:00.000Z")
  return () => stamp
}

function buildTestRun(opts?: { assetsDir?: string }) {
  const { db } = openAssetDatabase({ path: ":memory:" })
  const assetRepo = createAssetRepo(db)
  const batchRepo = createBatchRepo(db)
  const run = createArtworkBatchRun(
    (_params) => ({ assetRepo, batchRepo, provider: mockProvider }),
    { now: fixedClock(), ...(opts?.assetsDir ? { assetsDir: opts.assetsDir } : {}) },
  )
  return { run, db, assetRepo, batchRepo }
}

function baseRunParams(overrides?: Partial<WorkflowRunParams>): WorkflowRunParams {
  return {
    profile,
    providerId: "mock",
    modelId: "mock-fast",
    aspectRatio: "1:1",
    input: ArtworkBatchInputSchema.parse({
      group: "memory",
      subjectDescription: "family photo, warm light",
      conceptCount: 2,
      variantsPerConcept: 1,
      seed: 42,
    }),
    abortSignal: new AbortController().signal,
    batchId: "batch_test_01",
    ...overrides,
  }
}

// ---------- concept-generator ----------

describe("pickConcepts — deterministic shuffle", () => {
  it("same seed → same ordered subset across calls", () => {
    const a = pickConcepts(pool, 3, 42)
    const b = pickConcepts(pool, 3, 42)
    expect(a).toEqual(b)
  })

  it("different seeds → different ordering (probabilistically)", () => {
    const a = pickConcepts(pool, 5, 1)
    const b = pickConcepts(pool, 5, 999)
    expect(a).not.toEqual(b)
  })

  it("clamps count to pool size when count exceeds pool length", () => {
    const picked = pickConcepts(pool, 50, 7)
    expect(picked).toHaveLength(pool.length)
  })
})

describe("deriveSeed — per-concept seed derivation", () => {
  it("same (batchSeed, salt) → same output", () => {
    expect(deriveSeed(42, "Wedding")).toBe(deriveSeed(42, "Wedding"))
  })

  it("different salts → distinct seeds", () => {
    const a = deriveSeed(42, "Wedding")
    const b = deriveSeed(42, "Family")
    expect(a).not.toBe(b)
  })

  it("returns an unsigned 32-bit integer", () => {
    const seed = deriveSeed(42, "Wedding")
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(2 ** 32)
    expect(Number.isInteger(seed)).toBe(true)
  })
})

describe("generateConcepts — integration of pickConcepts + deriveSeed", () => {
  it("produces concepts with required fields, deterministic titles for fixed seed", () => {
    const input = ArtworkBatchInputSchema.parse({
      group: "memory",
      subjectDescription: "sunset portrait",
      conceptCount: 3,
      variantsPerConcept: 1,
      seed: 42,
    })
    const out1 = generateConcepts({ input, templates: templatesFixture, batchSeed: 42 })
    const out2 = generateConcepts({ input, templates: templatesFixture, batchSeed: 42 })
    expect(out1.map((c) => c.title)).toEqual(out2.map((c) => c.title))
    expect(out1).toHaveLength(3)
    for (const c of out1) {
      expect(c.id).toMatch(/^cpt_/)
      expect(c.description).toBe("sunset portrait")
      expect(c.tags).toContain("memory")
      expect(typeof c.seed).toBe("number")
    }
  })
})

// ---------- prompt-builder ----------

describe("buildPrompt — composition rules", () => {
  const concept = { id: "cpt_x", title: "Wedding", description: "warm family photo", seed: 7, tags: ["memory"] }

  it("includes tone / subject / palette / do / dont lines for en locale (no language suffix)", () => {
    const prompt = buildPrompt({ concept, profile, locale: "en" })
    expect(prompt).toMatch(/Style tone: minimal/)
    expect(prompt).toMatch(/Subject: warm family photo/)
    expect(prompt).toMatch(/Create wedding artwork for ChartLens app/)
    expect(prompt).toMatch(/#111111/)
    expect(prompt).toMatch(/Must include: clean grid, soft shadows/)
    expect(prompt).toMatch(/Avoid: clutter/)
    expect(prompt).not.toMatch(/Output language/)
  })

  it("appends language instruction only when locale !== 'en'", () => {
    const prompt = buildPrompt({ concept, profile, locale: "vi" })
    expect(prompt).toMatch(/Output language for any embedded text: vi/)
  })

  it("omits do/dont lines when the profile arrays are empty", () => {
    const bareProfile: AppProfile = {
      ...profile,
      visual: { ...profile.visual, doList: [], dontList: [] },
    }
    const prompt = buildPrompt({ concept, profile: bareProfile, locale: "en" })
    expect(prompt).not.toMatch(/Must include:/)
    expect(prompt).not.toMatch(/Avoid:/)
  })
})

// ---------- input-schema guardrails ----------

describe("ArtworkBatchInputSchema — Session #10 Q7 guardrail", () => {
  it("rejects `aspectRatio` key (top-level run param, must not be on input)", () => {
    expect(() =>
      ArtworkBatchInputSchema.parse({
        group: "memory",
        subjectDescription: "x",
        aspectRatio: "1:1",
      }),
    ).toThrow()
  })

  it("rejects `language` key", () => {
    expect(() =>
      ArtworkBatchInputSchema.parse({
        group: "memory",
        subjectDescription: "x",
        language: "vi",
      }),
    ).toThrow()
  })
})

// ---------- run() happy path + abort ----------

async function collectEvents(
  gen: AsyncGenerator<WorkflowEvent>,
  maxSteps = 50,
): Promise<WorkflowEvent[]> {
  const events: WorkflowEvent[] = []
  for (let i = 0; i < maxSteps; i++) {
    const step = await gen.next()
    if (step.done) break
    events.push(step.value)
  }
  return events
}

describe("artwork-batch run — happy path", () => {
  it("emits started → concept_generated × 2 → image_generated × 2 → complete", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-run-"))
    try {
      const { run, batchRepo } = buildTestRun({ assetsDir: dir })
      const events = await collectEvents(run(baseRunParams()))
      const types = events.map((e) => e.type)
      expect(types).toEqual([
        "started",
        "concept_generated",
        "image_generated",
        "concept_generated",
        "image_generated",
        "complete",
      ])
      const batch = batchRepo.findById("batch_test_01")
      expect(batch?.status).toBe("completed")
      expect(batch?.successfulAssets).toBe(2)
      expect(batch?.completedAt).toBeTruthy()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("writes PNG to `data/assets/{profileId}/{YYYY-MM-DD}/{id}.png` and inserts row", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-run-"))
    try {
      const { run, assetRepo } = buildTestRun({ assetsDir: dir })
      const events = await collectEvents(run(baseRunParams()))
      const image = events.find((e) => e.type === "image_generated")
      expect(image?.type).toBe("image_generated")
      if (image?.type !== "image_generated") throw new Error("never")
      const asset = image.asset
      expect(asset.batchId).toBe("batch_test_01")
      expect(asset.replayClass).toBe("deterministic")  // Q7 — Mock + per-concept seed
      expect(asset.imageUrl).toBe(`/api/assets/${asset.id}/file`)

      // Asset file must exist on disk at the Q3-locked path layout.
      const expectedPath = join(dir, profile.id, "2026-04-22", `${asset.id}.png`)
      expect(() => readFileSync(expectedPath)).not.toThrow()

      // DB row linked to batch.
      const found = assetRepo.findByBatch("batch_test_01")
      expect(found).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("same seed → same picked concept titles (end-to-end determinism)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-run-"))
    try {
      const { run: runA } = buildTestRun({ assetsDir: dir })
      const { run: runB } = buildTestRun({ assetsDir: dir })
      const eventsA = await collectEvents(runA(baseRunParams()))
      const eventsB = await collectEvents(runB(baseRunParams({ batchId: "batch_test_02" })))
      const titlesA = eventsA
        .filter((e) => e.type === "concept_generated")
        .map((e) => (e.type === "concept_generated" ? e.concept.title : ""))
      const titlesB = eventsB
        .filter((e) => e.type === "concept_generated")
        .map((e) => (e.type === "concept_generated" ? e.concept.title : ""))
      expect(titlesA).toEqual(titlesB)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("artwork-batch run — abort semantics", () => {
  it("pre-aborted signal yields started → aborted, no image events, batch row = aborted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-run-"))
    try {
      const { run, batchRepo } = buildTestRun({ assetsDir: dir })
      const controller = new AbortController()
      controller.abort()
      const events = await collectEvents(run(baseRunParams({ abortSignal: controller.signal })))
      const types = events.map((e) => e.type)
      expect(types).toContain("started")
      expect(types).toContain("aborted")
      expect(types).not.toContain("image_generated")
      expect(types).not.toContain("complete")
      expect(batchRepo.findById("batch_test_01")?.status).toBe("aborted")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("mid-flight abort after first image — partial success + aborted event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-run-"))
    try {
      const { run, batchRepo } = buildTestRun({ assetsDir: dir })
      const controller = new AbortController()
      const gen = run(
        baseRunParams({
          abortSignal: controller.signal,
          input: ArtworkBatchInputSchema.parse({
            group: "memory",
            subjectDescription: "x",
            conceptCount: 3,
            variantsPerConcept: 1,
            seed: 42,
          }),
        }),
      )

      const collected: WorkflowEvent[] = []
      // started
      collected.push((await gen.next()).value as WorkflowEvent)
      // concept_generated[0]
      collected.push((await gen.next()).value as WorkflowEvent)
      // image_generated[0]
      collected.push((await gen.next()).value as WorkflowEvent)
      controller.abort()
      // concept_generated[1] — may still emit before abort is checked
      // But next await provider.generate() will see aborted and the loop's
      // abort check before generate will fire. Iterate to drain.
      for (;;) {
        const step = await gen.next()
        if (step.done) break
        collected.push(step.value)
      }

      const types = collected.map((e) => e.type)
      expect(types[0]).toBe("started")
      expect(types).toContain("image_generated")
      expect(types).toContain("aborted")
      expect(types).not.toContain("complete")

      const batch = batchRepo.findById("batch_test_01")
      expect(batch?.status).toBe("aborted")
      expect(batch?.successfulAssets).toBeGreaterThanOrEqual(1)
      expect(batch?.successfulAssets).toBeLessThan(3)
      expect(batch?.abortedAt).toBeTruthy()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
