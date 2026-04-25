// Phase D1 (Session #44) — unit tests for ad-production policy wiring.
//
// Stubs `checkPolicy` via the AdProductionOptions DI seam so each branch
// (block / unoverridden-warning / clean / override-cleared-warning) is
// exercised without touching the on-disk meta.json rule set. Asserts:
//   - SSE event sequence (started → policy_blocked|policy_warned? →
//     concept/image events → complete|aborted)
//   - audit-blob round-trip (decision in batches.policy_decision_json
//     for non-empty decisions, NULL on the clean path per Q-44.F)
//   - block path emits `error` (code:"PolicyBlocked") + finalize(error)

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
  AdProductionInputSchema,
  createAdProductionRun,
} from "@/workflows/ad-production"
import type { WorkflowRunParams } from "@/workflows/types"

// ---- fixtures ----

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
        ruleId: "meta-ads-claims-miracle-001",
        severity: "block",
        kind: "keyword-blocklist",
        message: 'Matched blocked keyword "miracle" in prompt/copy.',
        details: { keyword: "miracle", caseInsensitive: true },
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
        ruleId: "meta-ads-claims-unbeatable-001",
        severity: "warning",
        kind: "keyword-blocklist",
        message: 'Matched blocked keyword "unbeatable" in prompt/copy.',
        details: { keyword: "unbeatable", caseInsensitive: true },
      },
    ],
  }
}

function decisionWarningOverridden(): PolicyDecision {
  return {
    decidedAt: "2026-04-25T10:00:00.000Z",
    ok: true,
    violations: [
      {
        ruleId: "meta-ads-claims-unbeatable-001",
        severity: "warning",
        kind: "keyword-blocklist",
        message: 'Matched blocked keyword "unbeatable" in prompt/copy.',
        details: {
          keyword: "unbeatable",
          caseInsensitive: true,
          overridden: true,
        },
      },
    ],
    overrides: [
      {
        ruleId: "meta-ads-claims-unbeatable-001",
        reason: "approved by marketing copy review",
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
  const calls: number[] = []
  const checkPolicy = (() => {
    let n = 0
    return () => {
      n++
      calls.push(n)
      return opts.decision
    }
  })()
  const run = createAdProductionRun(
    () => ({ assetRepo, batchRepo, provider: mockProvider }),
    {
      assetsDir: opts.assetsDir,
      now: fixedClock(),
      checkPolicy,
    },
  )
  return { run, db, assetRepo, batchRepo, calls }
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
    batchId: "batch_ad_pol",
    ...overrides,
  }
}

async function collect(
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

// ---- tests ----

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "igart-d1-policy-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("ad-production runner — policy preflight", () => {
  it("block path: emits started → policy_blocked → error(PolicyBlocked); finalize(error) writes decision", async () => {
    const { run, batchRepo, calls } = buildTestRun({
      assetsDir: dir,
      decision: decisionBlock(),
    })
    const events = await collect(run(baseRunParams()))
    const types = events.map((e) => e.type)

    expect(calls).toEqual([1]) // checkPolicy fires exactly once
    expect(types).toEqual(["started", "policy_blocked", "error"])

    const blocked = events.find((e) => e.type === "policy_blocked")
    if (blocked?.type !== "policy_blocked") throw new Error("never")
    expect(blocked.decision.ok).toBe(false)
    expect(blocked.batchId).toBe("batch_ad_pol")

    const errEvent = events.find((e) => e.type === "error")
    if (errEvent?.type !== "error") throw new Error("never")
    expect(errEvent.error.code).toBe("PolicyBlocked")
    expect(errEvent.context).toBe("policy-preflight")

    const batch = batchRepo.findById("batch_ad_pol")
    expect(batch?.status).toBe("error")
    expect(batch?.policyDecisionJson).not.toBeNull()
    const persisted = JSON.parse(batch!.policyDecisionJson!) as PolicyDecision
    expect(persisted.ok).toBe(false)
    expect(persisted.violations).toHaveLength(1)
  })

  it("warning path: emits policy_warned, batch completes, decision in audit blob", async () => {
    const { run, batchRepo } = buildTestRun({
      assetsDir: dir,
      decision: decisionWarning(),
    })
    const events = await collect(run(baseRunParams()))
    const types = events.map((e) => e.type)

    expect(types).toContain("policy_warned")
    expect(types[types.length - 1]).toBe("complete")
    expect(types.filter((t) => t === "image_generated")).toHaveLength(2)

    const batch = batchRepo.findById("batch_ad_pol")
    expect(batch?.status).toBe("completed")
    expect(batch?.policyDecisionJson).not.toBeNull()
    const persisted = JSON.parse(batch!.policyDecisionJson!) as PolicyDecision
    expect(persisted.ok).toBe(true)
    expect(persisted.violations[0]?.severity).toBe("warning")
  })

  it("clean path: no policy event, batch completes, audit blob NULL (Q-44.F skip-on-empty)", async () => {
    const { run, batchRepo } = buildTestRun({
      assetsDir: dir,
      decision: decisionClean(),
    })
    const events = await collect(run(baseRunParams()))
    const types = events.map((e) => e.type)

    expect(types).not.toContain("policy_warned")
    expect(types).not.toContain("policy_blocked")
    expect(types[types.length - 1]).toBe("complete")

    const batch = batchRepo.findById("batch_ad_pol")
    expect(batch?.status).toBe("completed")
    expect(batch?.policyDecisionJson).toBeNull()
  })

  it("override-cleared warning: no policy event but decision IS persisted (override row is the audit signal)", async () => {
    const { run, batchRepo } = buildTestRun({
      assetsDir: dir,
      decision: decisionWarningOverridden(),
    })
    const events = await collect(
      run(
        baseRunParams({
          policyOverrides: [
            {
              ruleId: "meta-ads-claims-unbeatable-001",
              reason: "approved by marketing copy review",
            },
          ],
        }),
      ),
    )
    const types = events.map((e) => e.type)

    expect(types).not.toContain("policy_warned")
    expect(types).not.toContain("policy_blocked")
    expect(types[types.length - 1]).toBe("complete")

    const batch = batchRepo.findById("batch_ad_pol")
    expect(batch?.policyDecisionJson).not.toBeNull()
    const persisted = JSON.parse(batch!.policyDecisionJson!) as PolicyDecision
    expect(persisted.overrides).toHaveLength(1)
    expect(persisted.violations[0]?.details).toMatchObject({ overridden: true })
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
    expect(types).not.toContain("image_generated")
    expect(types).not.toContain("complete")

    const batch = batchRepo.findById("batch_ad_pol")
    expect(batch?.status).toBe("aborted")
    // Aborted batches still surface the decision they were aborted with
    // — bro can later see "this batch was killed mid-run with an
    // unresolved warning" without crawling SSE replays.
    expect(batch?.policyDecisionJson).not.toBeNull()
  })
})
