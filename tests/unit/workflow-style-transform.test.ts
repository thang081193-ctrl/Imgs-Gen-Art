// Session #15 — unit tests for style-transform workflow.
//
// Covers: concept-generator purity (deterministic seeds per serial),
// prompt-composer composition, input-schema guardrails, Q2 source-asset
// precondition (3 error paths), runner happy path + Mock skip-source
// behavior.

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import type { AppProfile } from "@/core/schemas/app-profile"
import { openAssetDatabase } from "@/server/asset-store/db"
import { createAssetRepo } from "@/server/asset-store/asset-repo"
import { createBatchRepo } from "@/server/asset-store/batch-repo"
import {
  createProfileAssetsRepo,
  type ProfileAssetsRepo,
} from "@/server/asset-store/profile-assets-repo"
import { mockProvider } from "@/server/providers/mock"
import {
  StyleTransformInputSchema,
  buildStylePrompt,
  createStyleTransformRun,
  generateStyleConcepts,
} from "@/workflows/style-transform"
import type { WorkflowRunParams } from "@/workflows/types"
import type { StyleDnaFile } from "@/core/templates"

// ---------- fixtures ----------

const stylesFixture: StyleDnaFile = {
  schemaVersion: 1,
  styles: {
    ANIME: {
      key: "ANIME",
      label: "Anime / Manga",
      promptCues: "High-quality cel-shaded anime, sharp lineart",
      renderStyle: "Anime Masterpiece",
      uiVibe: "Bold Manga lines",
    },
    GHIBLI: {
      key: "GHIBLI",
      label: "Ghibli-inspired",
      promptCues: "Studio Ghibli aesthetic, hand-painted watercolor",
      renderStyle: "Hand-painted Watercolor",
      uiVibe: "Soft paper textures",
    },
    PIXAR: {
      key: "PIXAR",
      label: "Pixar / Disney 3D",
      promptCues: "Disney-style 3D render",
      renderStyle: "Stylized 3D Animation",
      uiVibe: "Glowing 3D neon borders",
    },
  },
}

const profile: AppProfile = {
  version: 1,
  id: "chartlens",
  name: "ChartLens",
  tagline: "x",
  category: "utility",
  assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
  visual: {
    primaryColor: "#111111",
    secondaryColor: "#ff66cc",
    accentColor: "#00ccff",
    tone: "minimal",
    doList: ["clean grid"],
    dontList: ["clutter"],
  },
  positioning: { usp: "x", targetPersona: "x", marketTier: "global" },
  context: { features: [], keyScenarios: [], forbiddenContent: [] },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
} as AppProfile

function fixedClock(): () => Date {
  const stamp = new Date("2026-04-22T10:00:00.000Z")
  return () => stamp
}

function seedScreenshot(repo: ProfileAssetsRepo, profileId: string): string {
  return repo.insert({
    id: "pa_screen_01",
    profileId,
    kind: "screenshot",
    filePath: "/fake/path/screen.png",
    mimeType: "image/png",
    fileSizeBytes: 1024,
  }).id
}

function buildTestRun(opts?: { assetsDir?: string; seedScreenshot?: boolean }) {
  const { db } = openAssetDatabase({ path: ":memory:" })
  const assetRepo = createAssetRepo(db)
  const batchRepo = createBatchRepo(db)
  const profileAssetsRepo = createProfileAssetsRepo(db)
  if (opts?.seedScreenshot !== false) seedScreenshot(profileAssetsRepo, profile.id)
  const run = createStyleTransformRun(
    (_params) => ({ assetRepo, batchRepo, profileAssetsRepo, provider: mockProvider }),
    { now: fixedClock(), ...(opts?.assetsDir ? { assetsDir: opts.assetsDir } : {}) },
  )
  return { run, db, assetRepo, batchRepo, profileAssetsRepo }
}

function baseRunParams(overrides?: Partial<WorkflowRunParams>): WorkflowRunParams {
  return {
    profile,
    providerId: "mock",
    modelId: "mock-fast",
    aspectRatio: "1:1",
    input: StyleTransformInputSchema.parse({
      sourceImageAssetId: "pa_screen_01",
      styleDnaKey: "ANIME",
      conceptCount: 2,
      variantsPerConcept: 1,
      seed: 42,
    }),
    abortSignal: new AbortController().signal,
    batchId: "batch_style_01",
    ...overrides,
  }
}

// ---------- concept-generator ----------

describe("generateStyleConcepts — deterministic per-serial seeds", () => {
  it("produces conceptCount distinct seeds for same (style, source, batchSeed)", () => {
    const concepts = generateStyleConcepts({
      conceptCount: 3,
      styleDnaKey: "ANIME",
      sourceAssetId: "pa_screen_01",
      batchSeed: 42,
      styles: stylesFixture,
    })
    expect(concepts).toHaveLength(3)
    const seeds = new Set(concepts.map((c) => c.seed))
    expect(seeds.size).toBe(3)
    for (const c of concepts) {
      expect(c.styleDnaKey).toBe("ANIME")
      expect(c.sourceAssetId).toBe("pa_screen_01")
      expect(c.title).toMatch(/#\d+$/)
    }
  })

  it("same inputs produce identical output (reproducibility)", () => {
    const a = generateStyleConcepts({
      conceptCount: 3, styleDnaKey: "GHIBLI",
      sourceAssetId: "src", batchSeed: 7, styles: stylesFixture,
    })
    const b = generateStyleConcepts({
      conceptCount: 3, styleDnaKey: "GHIBLI",
      sourceAssetId: "src", batchSeed: 7, styles: stylesFixture,
    })
    expect(a.map((c) => c.seed)).toEqual(b.map((c) => c.seed))
  })
})

// ---------- prompt-composer ----------

describe("buildStylePrompt — style cues injection", () => {
  it("includes the style label + promptCues from the fixture", () => {
    const [concept] = generateStyleConcepts({
      conceptCount: 1, styleDnaKey: "ANIME",
      sourceAssetId: "src", batchSeed: 1, styles: stylesFixture,
    })
    const p = buildStylePrompt({
      concept: concept!,
      profile,
      locale: "en",
      variantIndex: 0,
      styles: stylesFixture,
    })
    expect(p).toMatch(/Anime \/ Manga/)
    expect(p).toMatch(/cel-shaded/)
  })

  it("adds variant-angle line only when variantIndex > 0", () => {
    const [concept] = generateStyleConcepts({
      conceptCount: 1, styleDnaKey: "ANIME",
      sourceAssetId: "src", batchSeed: 1, styles: stylesFixture,
    })
    const p0 = buildStylePrompt({
      concept: concept!, profile, locale: "en", variantIndex: 0, styles: stylesFixture,
    })
    const p1 = buildStylePrompt({
      concept: concept!, profile, locale: "en", variantIndex: 1, styles: stylesFixture,
    })
    expect(p0).not.toMatch(/Variant angle/)
    expect(p1).toMatch(/Variant angle #2/)
  })
})

// ---------- input-schema guardrails ----------

describe("StyleTransformInputSchema — banned keys + enum", () => {
  it("rejects aspectRatio", () => {
    expect(() => StyleTransformInputSchema.parse({
      sourceImageAssetId: "x", styleDnaKey: "ANIME", aspectRatio: "1:1",
    })).toThrow()
  })

  it("rejects language", () => {
    expect(() => StyleTransformInputSchema.parse({
      sourceImageAssetId: "x", styleDnaKey: "ANIME", language: "vi",
    })).toThrow()
  })

  it("rejects non-ArtStyleKey values", () => {
    expect(() => StyleTransformInputSchema.parse({
      sourceImageAssetId: "x", styleDnaKey: "COMIC",
    })).toThrow()
  })
})

// ---------- runner — Q2 precondition ----------

async function collect(gen: AsyncGenerator<WorkflowEvent>, max = 50) {
  const events: WorkflowEvent[] = []
  for (let i = 0; i < max; i++) {
    const s = await gen.next()
    if (s.done) break
    events.push(s.value)
  }
  return events
}

describe("style-transform run — Q2 source-asset precondition", () => {
  it("throws SOURCE_ASSET_NOT_FOUND before first yield when sourceImageAssetId is unknown", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-style-"))
    try {
      const { run } = buildTestRun({ assetsDir: dir })
      const gen = run(baseRunParams({
        input: StyleTransformInputSchema.parse({
          sourceImageAssetId: "pa_does_not_exist",
          styleDnaKey: "ANIME",
          conceptCount: 1,
          variantsPerConcept: 1,
          seed: 42,
        }),
      }))
      await expect(gen.next()).rejects.toThrow(/not found/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("throws when the source asset belongs to a different profile", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-style-"))
    try {
      const { run, profileAssetsRepo } = buildTestRun({ assetsDir: dir, seedScreenshot: false })
      profileAssetsRepo.insert({
        id: "pa_other_profile",
        profileId: "someone-else",
        kind: "screenshot",
        filePath: "/fake/other.png",
        mimeType: "image/png",
      })
      const gen = run(baseRunParams({
        input: StyleTransformInputSchema.parse({
          sourceImageAssetId: "pa_other_profile",
          styleDnaKey: "ANIME",
          conceptCount: 1,
          variantsPerConcept: 1,
          seed: 42,
        }),
      }))
      await expect(gen.next()).rejects.toThrow(/does not belong/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("throws SOURCE_ASSET_WRONG_KIND when the asset is not a screenshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-style-"))
    try {
      const { run, profileAssetsRepo } = buildTestRun({ assetsDir: dir, seedScreenshot: false })
      profileAssetsRepo.insert({
        id: "pa_logo_01",
        profileId: profile.id,
        kind: "logo",
        filePath: "/fake/logo.png",
        mimeType: "image/png",
      })
      const gen = run(baseRunParams({
        input: StyleTransformInputSchema.parse({
          sourceImageAssetId: "pa_logo_01",
          styleDnaKey: "ANIME",
          conceptCount: 1,
          variantsPerConcept: 1,
          seed: 42,
        }),
      }))
      await expect(gen.next()).rejects.toThrow(/must be a screenshot/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---------- runner — happy path + Mock skip-source ----------

describe("style-transform run — happy path", () => {
  it("emits started → (concept × image) × 2 → complete; Mock generates without reading source file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-style-"))
    try {
      const { run, assetRepo } = buildTestRun({ assetsDir: dir })
      const events = await collect(run(baseRunParams()))
      const types = events.map((e) => e.type)
      expect(types).toEqual([
        "started",
        "concept_generated",
        "image_generated",
        "concept_generated",
        "image_generated",
        "complete",
      ])

      const image = events.find((e) => e.type === "image_generated")
      if (image?.type !== "image_generated") throw new Error("never")
      expect(image.asset.workflowId).toBe("style-transform")
      expect(image.asset.replayClass).toBe("deterministic")

      const expectedPath = join(dir, profile.id, "2026-04-22", `${image.asset.id}.png`)
      expect(() => readFileSync(expectedPath)).not.toThrow()
      expect(assetRepo.findByBatch("batch_style_01")).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
