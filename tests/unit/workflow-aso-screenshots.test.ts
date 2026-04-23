// Session #15 — unit tests for aso-screenshots workflow.
//
// Covers: phone-UI filter, concept-generator purity, Q3 runtime validator
// (targetLangs ⊆ supportedLanguages), prompt-composer, input-schema
// guardrails, runner happy path with lang-matrix.

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import type { AppProfile } from "@/core/schemas/app-profile"
import type { AdLayoutsFile, CopyTemplatesFile } from "@/core/templates"
import { openAssetDatabase } from "@/server/asset-store/db"
import { createAssetRepo } from "@/server/asset-store/asset-repo"
import { createBatchRepo } from "@/server/asset-store/batch-repo"
import { mockProvider } from "@/server/providers/mock"
import {
  AsoScreenshotsInputSchema,
  buildAsoPrompt,
  createAsoScreenshotsRun,
  generateAsoConcepts,
  phoneUiLayoutIds,
  pickAsoLayouts,
} from "@/workflows/aso-screenshots"
import type { WorkflowRunParams } from "@/workflows/types"

// ---------- fixtures ----------

const layoutsFixture: AdLayoutsFile = {
  schemaVersion: 1,
  layouts: {
    screen_hero: {
      id: "screen_hero",
      feature: "enhance",
      hasPhoneUI: true,
      type: "hero",
      description: "Device-framed hero screenshot",
      beforeStyle: "Empty device frame",
      afterStyle: "App home screen inside device",
    },
    screen_feature_list: {
      id: "screen_feature_list",
      feature: "all_in_one",
      hasPhoneUI: true,
      type: "feature-list",
      description: "Bullet-listed feature callouts around a phone",
      beforeStyle: "Plain callouts",
      afterStyle: "Rich feature annotations",
    },
    ad_split_no_ui: {
      id: "ad_split_no_ui",
      feature: "restore",
      hasPhoneUI: false,  // Must be filtered out by phoneUiLayoutIds.
      type: "split",
      description: "Before/after split with no device",
      beforeStyle: "x",
      afterStyle: "y",
    },
  },
}

const copyFixture: CopyTemplatesFile = {
  schemaVersion: 1,
  templates: {
    en: { h: ["H1", "H2", "H3"], s: ["S1", "S2", "S3"] },
    vi: { h: ["V1", "V2", "V3"], s: ["VS1", "VS2", "VS3"] },
    ja: { h: ["J1", "J2", "J3"], s: ["JS1", "JS2", "JS3"] },
    ko: { h: ["K1", "K2", "K3"], s: ["KS1", "KS2", "KS3"] },
    th: { h: ["T1", "T2", "T3"], s: ["TS1", "TS2", "TS3"] },
    es: { h: ["E1", "E2", "E3"], s: ["ES1", "ES2", "ES3"] },
    fr: { h: ["F1", "F2", "F3"], s: ["FS1", "FS2", "FS3"] },
    pt: { h: ["P1", "P2", "P3"], s: ["PS1", "PS2", "PS3"] },
    it: { h: ["I1", "I2", "I3"], s: ["IS1", "IS2", "IS3"] },
    de: { h: ["D1", "D2", "D3"], s: ["DS1", "DS2", "DS3"] },
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
    primaryColor: "#111",
    secondaryColor: "#ff66cc",
    accentColor: "#0cf",
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

function buildTestRun(opts?: { assetsDir?: string }) {
  const { db } = openAssetDatabase({ path: ":memory:" })
  const assetRepo = createAssetRepo(db)
  const batchRepo = createBatchRepo(db)
  const run = createAsoScreenshotsRun(
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
    input: AsoScreenshotsInputSchema.parse({
      conceptCount: 2,
      variantsPerConcept: 1,
      targetLangs: ["en", "vi"],
      seed: 42,
    }),
    abortSignal: new AbortController().signal,
    batchId: "batch_aso_01",
    ...overrides,
  }
}

// ---------- phoneUiLayoutIds ----------

describe("phoneUiLayoutIds — filters to hasPhoneUI=true", () => {
  it("drops layouts where hasPhoneUI is false", () => {
    const ids = phoneUiLayoutIds(layoutsFixture)
    expect(ids).toEqual(["screen_feature_list", "screen_hero"])  // sorted
    expect(ids).not.toContain("ad_split_no_ui")
  })
})

describe("pickAsoLayouts — deterministic shuffle", () => {
  it("same seed → same picks", () => {
    const pool = phoneUiLayoutIds(layoutsFixture)
    expect(pickAsoLayouts(pool, 2, 42)).toEqual(pickAsoLayouts(pool, 2, 42))
  })

  it("throws when pool is empty", () => {
    expect(() => pickAsoLayouts([], 1, 42)).toThrow(/no phone-UI layouts/)
  })
})

describe("generateAsoConcepts — integration", () => {
  it("produces conceptCount concepts with unique deterministic seeds", () => {
    const concepts = generateAsoConcepts({
      conceptCount: 2, batchSeed: 42, layouts: layoutsFixture,
    })
    expect(concepts).toHaveLength(2)
    const seeds = new Set(concepts.map((c) => c.seed))
    expect(seeds.size).toBe(2)
    for (const c of concepts) {
      expect(c.layoutId).toMatch(/^screen_/)
      expect(c.tags).toContain(c.layoutId)
    }
  })
})

// ---------- prompt-composer ----------

describe("buildAsoPrompt — lang-specific headlines", () => {
  it("pulls headline from copy-templates for the requested targetLang", () => {
    const [concept] = generateAsoConcepts({
      conceptCount: 1, batchSeed: 1, layouts: layoutsFixture,
    })
    const en = buildAsoPrompt({
      concept: concept!, profile, locale: "en", targetLang: "en",
      variantIndex: 0, layouts: layoutsFixture, copyTemplates: copyFixture,
    })
    const vi = buildAsoPrompt({
      concept: concept!, profile, locale: "en", targetLang: "vi",
      variantIndex: 0, layouts: layoutsFixture, copyTemplates: copyFixture,
    })
    expect(en).toMatch(/"H1"/)
    expect(vi).toMatch(/"V1"/)
    expect(en).not.toEqual(vi)
  })
})

// ---------- input-schema guardrails ----------

describe("AsoScreenshotsInputSchema", () => {
  it("rejects aspectRatio + language keys", () => {
    expect(() => AsoScreenshotsInputSchema.parse({
      targetLangs: ["en"], aspectRatio: "1:1",
    })).toThrow()
    expect(() => AsoScreenshotsInputSchema.parse({
      targetLangs: ["en"], language: "vi",
    })).toThrow()
  })

  it("rejects empty targetLangs array", () => {
    expect(() => AsoScreenshotsInputSchema.parse({ targetLangs: [] })).toThrow()
  })

  it("rejects more than 3 targetLangs (Q3 cost control)", () => {
    expect(() => AsoScreenshotsInputSchema.parse({
      targetLangs: ["en", "vi", "ja", "ko"],
    })).toThrow()
  })

  it("rejects targetLangs not in CopyLang enum (e.g. 'zh' — Session #15 resolution C)", () => {
    expect(() => AsoScreenshotsInputSchema.parse({
      targetLangs: ["zh"],
    })).toThrow()
  })

  it("accepts 'th' — present in CopyLang, absent from provider-supportedLanguages (runtime layer catches)", () => {
    const parsed = AsoScreenshotsInputSchema.parse({ targetLangs: ["th"] })
    expect(parsed.targetLangs).toEqual(["th"])
  })
})

// ---------- runtime validator ----------

async function collect(gen: AsyncGenerator<WorkflowEvent>, max = 100) {
  const events: WorkflowEvent[] = []
  for (let i = 0; i < max; i++) {
    const s = await gen.next()
    if (s.done) break
    events.push(s.value)
  }
  return events
}

describe("aso-screenshots run — Q3 targetLang runtime check", () => {
  it("throws RuntimeValidationError when a targetLang is not in provider.supportedLanguages ('th' on Mock)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-aso-"))
    try {
      const { run } = buildTestRun({ assetsDir: dir })
      const gen = run(baseRunParams({
        input: AsoScreenshotsInputSchema.parse({
          conceptCount: 1,
          variantsPerConcept: 1,
          targetLangs: ["th"],  // Mock.supportedLanguages doesn't include 'th'
          seed: 42,
        }),
      }))
      await expect(gen.next()).rejects.toThrow(/not supported/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---------- runner — happy path ----------

describe("aso-screenshots run — lang-matrix happy path", () => {
  it("emits N × |langs| × V image events; total = conceptCount × targetLangs × variants", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-aso-"))
    try {
      const { run, assetRepo, batchRepo } = buildTestRun({ assetsDir: dir })
      const events = await collect(run(baseRunParams()))
      const types = events.map((e) => e.type)
      // 2 concepts × 2 langs × 1 variant = 4 image events
      const imageCount = types.filter((t) => t === "image_generated").length
      expect(imageCount).toBe(4)
      expect(types[0]).toBe("started")
      expect(types[types.length - 1]).toBe("complete")
      expect(batchRepo.findById("batch_aso_01")?.totalAssets).toBe(4)
      expect(batchRepo.findById("batch_aso_01")?.successfulAssets).toBe(4)

      const rows = assetRepo.findByBatch("batch_aso_01")
      expect(rows).toHaveLength(4)
      // All rows tagged by (layoutId, lang) pair.
      for (const r of rows) {
        expect(r.tags.length).toBeGreaterThanOrEqual(2)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("per-asset seeds differ across targetLangs for the same concept (Q7 salt layoutId:lang)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-aso-"))
    try {
      const { run, assetRepo } = buildTestRun({ assetsDir: dir })
      await collect(run(baseRunParams()))
      const rows = assetRepo.findByBatch("batch_aso_01")
      // Group by concept (variantGroup encodes layout:lang so use concept lookup via inputParams).
      const byLayout = new Map<string, Set<number>>()
      for (const r of rows) {
        const params = JSON.parse(r.inputParams) as { layoutId: string }
        const seeds = byLayout.get(params.layoutId) ?? new Set<number>()
        if (r.seed !== null) seeds.add(r.seed)
        byLayout.set(params.layoutId, seeds)
      }
      for (const seeds of byLayout.values()) {
        expect(seeds.size).toBe(2)  // 2 targetLangs → 2 distinct asset seeds per layout
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
