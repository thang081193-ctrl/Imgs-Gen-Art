// Phase F1 (Session #44) — aso-screenshots runner policy wiring tests.
//
// Stubs checkPolicy via the AsoScreenshotsOptions DI seam — same shape
// as D1's ad-production-run-policy suite. Asserts each branch (block /
// unoverridden warning / clean) threads the decision into the audit
// blob, and that aborted-mid-run still persists the preflight decision.

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import type { PolicyDecision } from "@/core/schemas/policy-decision"
import type { AppProfile } from "@/core/schemas/app-profile"
import { openAssetDatabase } from "@/server/asset-store/db"
import { createAssetRepo } from "@/server/asset-store/asset-repo"
import { createBatchRepo } from "@/server/asset-store/batch-repo"
import { mockProvider } from "@/server/providers/mock"
import {
  AsoScreenshotsInputSchema,
  createAsoScreenshotsRun,
} from "@/workflows/aso-screenshots"
import type { WorkflowRunParams } from "@/workflows/types"

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
  const stamp = new Date("2026-04-25T10:00:00.000Z")
  return () => stamp
}

function decisionBlock(): PolicyDecision {
  return {
    decidedAt: "2026-04-25T10:00:00.000Z",
    ok: false,
    violations: [
      {
        ruleId: "play-incentives-free-download-001",
        severity: "block",
        kind: "keyword-blocklist",
        message: 'Matched blocked keyword "free download" in prompt/copy.',
        details: { keyword: "free download", caseInsensitive: true },
      },
    ],
  }
}

function decisionWarning(): PolicyDecision {
  return {
    decidedAt: "2026-04-25T10:00:00.000Z",
    ok: true,
    violations: [
      {
        ruleId: "play-rating-manipulation-five-stars-001",
        severity: "warning",
        kind: "keyword-blocklist",
        message: 'Matched blocked keyword "5 stars" in prompt/copy.',
        details: { keyword: "5 stars", caseInsensitive: true },
      },
    ],
  }
}

function decisionClean(): PolicyDecision {
  return {
    decidedAt: "2026-04-25T10:00:00.000Z",
    ok: true,
    violations: [],
  }
}

function buildTestRun(opts: {
  assetsDir: string
  decision: PolicyDecision
}) {
  const { db } = openAssetDatabase({ path: ":memory:" })
  const assetRepo = createAssetRepo(db)
  const batchRepo = createBatchRepo(db)
  const checkPolicy = (() => () => opts.decision)()
  const run = createAsoScreenshotsRun(
    () => ({ assetRepo, batchRepo, provider: mockProvider }),
    {
      assetsDir: opts.assetsDir,
      now: fixedClock(),
      checkPolicy,
    },
  )
  return { run, db, assetRepo, batchRepo }
}

function baseRunParams(overrides?: Partial<WorkflowRunParams>): WorkflowRunParams {
  return {
    profile,
    providerId: "mock",
    modelId: "mock-fast",
    // Mock model accepts 9:16; the play-aso aspect-ratio rule is
    // disabled by the stubbed checkPolicy decision anyway.
    aspectRatio: "9:16",
    input: AsoScreenshotsInputSchema.parse({
      conceptCount: 1,
      variantsPerConcept: 1,
      targetLangs: ["en"],
      seed: 13,
    }),
    abortSignal: new AbortController().signal,
    batchId: "batch_aso_pol",
    ...overrides,
  }
}

async function collect(
  gen: AsyncGenerator<WorkflowEvent>,
  maxSteps = 30,
): Promise<WorkflowEvent[]> {
  const events: WorkflowEvent[] = []
  for (let i = 0; i < maxSteps; i++) {
    const step = await gen.next()
    if (step.done) break
    events.push(step.value)
  }
  return events
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "igart-f1-policy-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("aso-screenshots runner — policy preflight", () => {
  it("block: emits started → policy_blocked → error(PolicyBlocked); finalize(error) writes decision", async () => {
    const { run, batchRepo } = buildTestRun({
      assetsDir: dir,
      decision: decisionBlock(),
    })
    const events = await collect(run(baseRunParams()))
    const types = events.map((e) => e.type)

    expect(types).toEqual(["started", "policy_blocked", "error"])
    const errEvent = events.find((e) => e.type === "error")
    if (errEvent?.type !== "error") throw new Error("never")
    expect(errEvent.error.code).toBe("PolicyBlocked")

    const batch = batchRepo.findById("batch_aso_pol")
    expect(batch?.status).toBe("error")
    expect(batch?.policyDecisionJson).not.toBeNull()
  })

  it("warning: policy_warned fires before image_generated; batch completes; decision in audit", async () => {
    const { run, batchRepo } = buildTestRun({
      assetsDir: dir,
      decision: decisionWarning(),
    })
    const events = await collect(run(baseRunParams()))
    const types = events.map((e) => e.type)

    const warnIdx = types.indexOf("policy_warned")
    const imgIdx = types.indexOf("image_generated")
    expect(warnIdx).toBeGreaterThan(-1)
    expect(imgIdx).toBeGreaterThan(warnIdx)
    expect(types[types.length - 1]).toBe("complete")

    const batch = batchRepo.findById("batch_aso_pol")
    expect(batch?.status).toBe("completed")
    expect(batch?.policyDecisionJson).not.toBeNull()
  })

  it("clean: no policy event; audit blob NULL (Q-44.F skip-on-empty)", async () => {
    const { run, batchRepo } = buildTestRun({
      assetsDir: dir,
      decision: decisionClean(),
    })
    const events = await collect(run(baseRunParams()))
    const types = events.map((e) => e.type)

    expect(types).not.toContain("policy_warned")
    expect(types).not.toContain("policy_blocked")
    expect(types[types.length - 1]).toBe("complete")

    const batch = batchRepo.findById("batch_aso_pol")
    expect(batch?.policyDecisionJson).toBeNull()
  })

  it("aborted-mid-run after warning preflight: aborted finalize threads the decision into audit", async () => {
    const controller = new AbortController()
    controller.abort()
    const { run, batchRepo } = buildTestRun({
      assetsDir: dir,
      decision: decisionWarning(),
    })
    const events = await collect(
      run(baseRunParams({ abortSignal: controller.signal })),
    )
    const types = events.map((e) => e.type)

    expect(types).toContain("policy_warned")
    expect(types).toContain("aborted")
    expect(types).not.toContain("complete")

    const batch = batchRepo.findById("batch_aso_pol")
    expect(batch?.status).toBe("aborted")
    expect(batch?.policyDecisionJson).not.toBeNull()
  })
})
