// Session #15 — unit tests for ad-production workflow.
//
// Covers: concept-generator purity (cartesian × seeded shuffle),
// prompt-composer composition, input-schema guardrails, runner happy
// path + abort semantics.

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
  AdProductionInputSchema,
  buildAdPrompt,
  cartesianPairs,
  createAdProductionRun,
  generateAdConcepts,
  pickPairs,
} from "@/workflows/ad-production"
import type { WorkflowRunParams } from "@/workflows/types"

// ---------- fixtures ----------

const layoutsFixture: AdLayoutsFile = {
  schemaVersion: 1,
  layouts: {
    restore_split_view: {
      id: "restore_split_view",
      feature: "restore",
      hasPhoneUI: false,
      type: "split-view",
      description: "Before/after horizontal split",
      beforeStyle: "Grainy faded photo",
      afterStyle: "Sharp restored colors",
    },
    restore_slider_reveal: {
      id: "restore_slider_reveal",
      feature: "restore",
      hasPhoneUI: true,
      type: "slider-reveal",
      description: "Draggable slider between before/after",
      beforeStyle: "Dusty old image",
      afterStyle: "Pristine reveal on drag",
    },
    cartoon_burst_multi_panel: {
      id: "cartoon_burst_multi_panel",
      feature: "cartoon",
      hasPhoneUI: false,
      type: "multi-panel",
      description: "Comic-book burst with 4 panels",
      beforeStyle: "Realistic face photo",
      afterStyle: "Bold-line cartoon burst",
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
  tagline: "Instant chart reader",
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
  positioning: { usp: "Snap a chart", targetPersona: "traders", marketTier: "global" },
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
  const run = createAdProductionRun(
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
    input: AdProductionInputSchema.parse({
      featureFocus: "restore",
      conceptCount: 2,
      variantsPerConcept: 1,
      seed: 42,
    }),
    abortSignal: new AbortController().signal,
    batchId: "batch_ad_01",
    ...overrides,
  }
}

// ---------- concept-generator ----------

describe("cartesianPairs — restricts to feature subset", () => {
  it("returns only layouts whose feature matches, paired with every copy lang (sorted)", () => {
    const pairs = cartesianPairs(layoutsFixture, copyFixture, "restore")
    expect(pairs.length).toBe(2 * 10)  // 2 restore layouts × 10 langs
    const uniqueLayouts = new Set(pairs.map((p) => p.layoutId))
    expect(uniqueLayouts).toEqual(new Set(["restore_slider_reveal", "restore_split_view"]))
  })

  it("returns empty array when feature has no layouts", () => {
    const pairs = cartesianPairs(layoutsFixture, copyFixture, "polaroid")
    expect(pairs).toEqual([])
  })
})

describe("pickPairs — deterministic shuffle", () => {
  it("same seed → same picks", () => {
    const all = cartesianPairs(layoutsFixture, copyFixture, "restore")
    const a = pickPairs(all, 5, 42)
    const b = pickPairs(all, 5, 42)
    expect(a).toEqual(b)
  })

  it("different seeds → different picks (probabilistically)", () => {
    const all = cartesianPairs(layoutsFixture, copyFixture, "restore")
    const a = pickPairs(all, 5, 1)
    const b = pickPairs(all, 5, 999)
    expect(a).not.toEqual(b)
  })

  it("clamps count to pool size", () => {
    const all = cartesianPairs(layoutsFixture, copyFixture, "restore")
    const picked = pickPairs(all, 999, 7)
    expect(picked).toHaveLength(all.length)
  })
})

describe("generateAdConcepts — integration", () => {
  it("throws for featureFocus with no layouts", () => {
    expect(() =>
      generateAdConcepts({
        conceptCount: 2,
        featureFocus: "polaroid",
        batchSeed: 42,
        layouts: layoutsFixture,
        copyTemplates: copyFixture,
      }),
    ).toThrow(/no layouts registered/)
  })

  it("produces N concepts with unique deterministic seeds", () => {
    const concepts = generateAdConcepts({
      conceptCount: 3,
      featureFocus: "restore",
      batchSeed: 42,
      layouts: layoutsFixture,
      copyTemplates: copyFixture,
    })
    expect(concepts).toHaveLength(3)
    const seeds = new Set(concepts.map((c) => c.seed))
    expect(seeds.size).toBe(3)
    for (const c of concepts) {
      expect(c.id).toMatch(/^cpt_/)
      expect(c.featureFocus).toBe("restore")
      expect(c.tags).toContain("restore")
      expect(c.tags).toContain(c.layoutId)
      expect(c.tags).toContain(c.copyKey)
    }
  })
})

// ---------- prompt-composer ----------

describe("buildAdPrompt — variant rotation", () => {
  it("picks h[variantIndex%3] / s[variantIndex%3] from the copy row", () => {
    const [concept] = generateAdConcepts({
      conceptCount: 1,
      featureFocus: "restore",
      batchSeed: 42,
      layouts: layoutsFixture,
      copyTemplates: copyFixture,
    })
    const p0 = buildAdPrompt({
      concept: concept!,
      profile,
      locale: "en",
      variantIndex: 0,
      layouts: layoutsFixture,
      copyTemplates: copyFixture,
    })
    const p1 = buildAdPrompt({
      concept: concept!,
      profile,
      locale: "en",
      variantIndex: 1,
      layouts: layoutsFixture,
      copyTemplates: copyFixture,
    })
    // Different variants should produce DIFFERENT headline text.
    expect(p0).not.toEqual(p1)
  })

  it("includes phone-UI note only when the layout declares hasPhoneUI=true", () => {
    const conceptPhone = {
      id: "cpt_x",
      title: "x",
      description: "x",
      seed: 1,
      tags: [],
      layoutId: "restore_slider_reveal",
      copyKey: "en",
      featureFocus: "restore" as const,
    }
    const conceptNoPhone = { ...conceptPhone, layoutId: "restore_split_view" }
    const withUi = buildAdPrompt({
      concept: conceptPhone, profile, locale: "en", variantIndex: 0,
      layouts: layoutsFixture, copyTemplates: copyFixture,
    })
    const withoutUi = buildAdPrompt({
      concept: conceptNoPhone, profile, locale: "en", variantIndex: 0,
      layouts: layoutsFixture, copyTemplates: copyFixture,
    })
    expect(withUi).toMatch(/phone-UI chrome/)
    expect(withoutUi).not.toMatch(/phone-UI chrome/)
  })
})

// ---------- input-schema guardrails ----------

describe("AdProductionInputSchema — banned keys", () => {
  it("rejects aspectRatio key", () => {
    expect(() =>
      AdProductionInputSchema.parse({
        featureFocus: "restore",
        aspectRatio: "1:1",
      }),
    ).toThrow()
  })

  it("rejects language key", () => {
    expect(() =>
      AdProductionInputSchema.parse({
        featureFocus: "restore",
        language: "vi",
      }),
    ).toThrow()
  })

  it("rejects featureFocus outside FEATURE_META enum", () => {
    expect(() =>
      AdProductionInputSchema.parse({ featureFocus: "nonexistent" }),
    ).toThrow()
  })
})

// ---------- runner ----------

async function collectEvents(
  gen: AsyncGenerator<WorkflowEvent>,
  maxSteps = 100,
): Promise<WorkflowEvent[]> {
  const events: WorkflowEvent[] = []
  for (let i = 0; i < maxSteps; i++) {
    const step = await gen.next()
    if (step.done) break
    events.push(step.value)
  }
  return events
}

describe("ad-production run — happy path", () => {
  it("emits started → (concept × image) × 2 → complete, writes PNGs, inserts rows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-ad-"))
    try {
      const { run, assetRepo, batchRepo } = buildTestRun({ assetsDir: dir })
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
      const batch = batchRepo.findById("batch_ad_01")
      expect(batch?.status).toBe("completed")
      expect(batch?.successfulAssets).toBe(2)

      const image = events.find((e) => e.type === "image_generated")
      if (image?.type !== "image_generated") throw new Error("never")
      expect(image.asset.workflowId).toBe("ad-production")
      expect(image.asset.replayClass).toBe("deterministic")

      const expectedPath = join(dir, profile.id, "2026-04-22", `${image.asset.id}.png`)
      expect(() => readFileSync(expectedPath)).not.toThrow()
      expect(assetRepo.findByBatch("batch_ad_01")).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("same seed → same picked concepts across runs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-ad-"))
    try {
      const { run: runA } = buildTestRun({ assetsDir: dir })
      const { run: runB } = buildTestRun({ assetsDir: dir })
      const a = await collectEvents(runA(baseRunParams()))
      const b = await collectEvents(runB(baseRunParams({ batchId: "batch_ad_02" })))
      const titlesA = a
        .filter((e) => e.type === "concept_generated")
        .map((e) => (e.type === "concept_generated" ? e.concept.title : ""))
      const titlesB = b
        .filter((e) => e.type === "concept_generated")
        .map((e) => (e.type === "concept_generated" ? e.concept.title : ""))
      expect(titlesA).toEqual(titlesB)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("ad-production run — pre-aborted signal", () => {
  it("yields started → aborted, no image events, batch row = aborted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igart-ad-"))
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
      expect(batchRepo.findById("batch_ad_01")?.status).toBe("aborted")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
