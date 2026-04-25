// Phase D1 (Session #44) — integration test for ad-production policy SSE.
//
// Drives `POST /api/workflows/ad-production/run` end-to-end against the
// real meta.json hand-curated rule set. Profiles are stitched in via a
// `vi.mock` over the loader module so the test never writes to the
// shared `data/profiles/` directory — that avoids racing the
// profiles-routes test's `listProfiles()` (which iterates the dir).
//
// Note on the `meta-ads-text-density-001` rule: its checker is a v2
// stub that emits one warning on EVERY preflight (carry-forward §15).
// For the policy-quiet branches we send an override for that pending
// rule alongside whatever D1 rule we're isolating. Q-44.F skip-on-empty
// (no violations + no overrides → audit blob NULL) is exercised in the
// unit suite (ad-production-run-policy.test.ts) which can stub
// checkPolicy directly.

import { existsSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { PolicyDecision } from "@/core/schemas/policy-decision"
import type { AppProfile } from "@/core/schemas/app-profile"
import { NotFoundError } from "@/core/shared/errors"

const TEST_PROFILES = new Map<string, AppProfile>()

// Hoisted mock — vitest moves vi.mock above imports, so we use the
// `TEST_PROFILES` map as a closure target. Every loadProfile call from
// the precondition layer reads from it instead of the on-disk dir.
vi.mock("@/server/profile-repo/loader", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/profile-repo/loader")
  >("@/server/profile-repo/loader")
  return {
    ...actual,
    loadProfile: (id: string): AppProfile => {
      const profile = TEST_PROFILES.get(id)
      if (!profile) {
        throw new NotFoundError(`Profile '${id}' not found`, { profileId: id })
      }
      return profile
    },
  }
})

// Imports below run AFTER the mock factory is registered. createApp +
// asset-store + policy-rules cache reset are pulled in here so any
// module-level loadProfile import already sees the patched function.
const { createApp } = await import("@/server/app")
const {
  _resetAssetStoreForTests,
  getBatchRepo,
  initAssetStore,
} = await import("@/server/asset-store/context")
const { resetPolicyRulesCacheForTests } = await import(
  "@/server/services/policy-rules"
)
const { preloadAllTemplates } = await import("@/server/templates")
const { _resetAbortRegistryForTests } = await import(
  "@/server/workflows-runtime/abort-registry"
)

const TEST_VERSION = "0.0.0-test"

const PENDING_OVERRIDE = {
  ruleId: "meta-ads-text-density-001",
  reason: "manual-review pending — image analysis not shipped (test seam)",
}

interface ParsedSSE {
  event: string
  data: unknown
}

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

async function readSSE(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("no body reader")
  const decoder = new TextDecoder()
  let out = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out
}

function parseSSEEvents(raw: string): ParsedSSE[] {
  const events: ParsedSSE[] = []
  for (const block of raw.split(/\n\n/)) {
    if (!block.trim()) continue
    const lines = block.split(/\n/)
    let ev = ""
    const dataLines: string[] = []
    for (const line of lines) {
      if (line.startsWith("event: ")) ev = line.slice(7)
      else if (line.startsWith("data: ")) dataLines.push(line.slice(6))
    }
    if (ev) {
      const data: unknown =
        dataLines.length > 0 ? JSON.parse(dataLines.join("\n")) : null
      events.push({ event: ev, data })
    }
  }
  return events
}

interface ProfileFixtureOpts {
  id: string
  doList: string[]
}

function registerProfile({ id, doList }: ProfileFixtureOpts): void {
  const profile = {
    version: 1,
    id,
    name: id,
    tagline: "test profile",
    category: "utility",
    assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
    visual: {
      primaryColor: "#111111",
      secondaryColor: "#ff66cc",
      accentColor: "#00ccff",
      tone: "minimal",
      doList,
      dontList: [],
    },
    positioning: {
      usp: "test",
      targetPersona: "testers",
      marketTier: "global",
    },
    context: { features: [], keyScenarios: [], forbiddenContent: [] },
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  } as AppProfile
  TEST_PROFILES.set(id, profile)
}

async function runPolicyBatch(opts: {
  profileId: string
  policyOverrides?: { ruleId: string; reason: string }[]
}): Promise<{ status: number; events: ParsedSSE[] }> {
  const body: Record<string, unknown> = {
    profileId: opts.profileId,
    providerId: "mock",
    modelId: "mock-fast",
    aspectRatio: "1:1",
    input: {
      featureFocus: "restore",
      conceptCount: 2,
      variantsPerConcept: 1,
      seed: 13,
    },
  }
  if (opts.policyOverrides) body["policyOverrides"] = opts.policyOverrides
  const res = await fetchApp("/api/workflows/ad-production/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (res.status !== 200) return { status: res.status, events: [] }
  const raw = await readSSE(res)
  return { status: 200, events: parseSSEEvents(raw) }
}

beforeAll(() => {
  preloadAllTemplates()
})

afterAll(() => {
  TEST_PROFILES.clear()
})

const ASSETS_CLEANUP_ROOT = resolve(process.cwd(), "data", "assets")
const TEST_PROFILE_IDS = [
  "d1-block-miracle",
  "d1-warn-unbeatable",
  "d1-all-overridden",
] as const

beforeEach(() => {
  _resetAbortRegistryForTests()
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
  resetPolicyRulesCacheForTests()
})

afterEach(() => {
  for (const id of TEST_PROFILE_IDS) {
    const dir = join(ASSETS_CLEANUP_ROOT, id)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }
})

describe("ad-production policy SSE — block / warning / all-overridden", () => {
  it("block: 'miracle' in doList → policy_blocked + error(PolicyBlocked); batch row = error with decision", async () => {
    registerProfile({ id: "d1-block-miracle", doList: ["miracle"] })
    const { status, events } = await runPolicyBatch({ profileId: "d1-block-miracle" })
    expect(status).toBe(200)

    const types = events.map((e) => e.event)
    const blockedIdx = types.indexOf("policy_blocked")
    const errIdx = types.indexOf("error")
    expect(blockedIdx).toBeGreaterThan(-1)
    expect(errIdx).toBeGreaterThan(blockedIdx)
    expect(types).not.toContain("image_generated")
    expect(types).not.toContain("complete")

    const errEvent = events.find((e) => e.event === "error")!
    expect((errEvent.data as { error: { code?: string } }).error.code).toBe(
      "PolicyBlocked",
    )

    const startedEvent = events.find((e) => e.event === "started")!
    const batchId = (startedEvent.data as { batchId: string }).batchId
    const batch = getBatchRepo().findById(batchId)
    expect(batch?.status).toBe("error")
    expect(batch?.policyDecisionJson).not.toBeNull()
    const persisted = JSON.parse(batch!.policyDecisionJson!) as PolicyDecision
    expect(persisted.ok).toBe(false)
    expect(
      persisted.violations.some(
        (v) => v.ruleId === "meta-ads-claims-miracle-001",
      ),
    ).toBe(true)
  }, 10000)

  it("warning: 'unbeatable' in doList + pending-stub override → policy_warned BEFORE images, batch completes, decision persisted", async () => {
    registerProfile({ id: "d1-warn-unbeatable", doList: ["unbeatable"] })
    const { status, events } = await runPolicyBatch({
      profileId: "d1-warn-unbeatable",
      policyOverrides: [PENDING_OVERRIDE],
    })
    expect(status).toBe(200)

    const types = events.map((e) => e.event)
    const warnIdx = types.indexOf("policy_warned")
    const firstImageIdx = types.indexOf("image_generated")
    expect(warnIdx).toBeGreaterThan(-1)
    expect(firstImageIdx).toBeGreaterThan(warnIdx)
    expect(types[types.length - 1]).toBe("complete")

    expect(types.filter((t) => t === "policy_warned")).toHaveLength(1)

    const startedEvent = events.find((e) => e.event === "started")!
    const batchId = (startedEvent.data as { batchId: string }).batchId
    const batch = getBatchRepo().findById(batchId)
    expect(batch?.status).toBe("completed")
    expect(batch?.policyDecisionJson).not.toBeNull()
    const persisted = JSON.parse(batch!.policyDecisionJson!) as PolicyDecision
    expect(persisted.ok).toBe(true)
    expect(
      persisted.violations.some(
        (v) =>
          v.ruleId === "meta-ads-claims-unbeatable-001" &&
          v.details?.["overridden"] !== true,
      ),
    ).toBe(true)
    expect(
      persisted.violations.find(
        (v) => v.ruleId === "meta-ads-text-density-001",
      )?.details,
    ).toMatchObject({ overridden: true })
  }, 10000)

  it("all-overridden: 'unbeatable' in doList + overrides for both unbeatable AND pending stub → no policy event, decision still persisted", async () => {
    registerProfile({ id: "d1-all-overridden", doList: ["unbeatable"] })
    const { status, events } = await runPolicyBatch({
      profileId: "d1-all-overridden",
      policyOverrides: [
        PENDING_OVERRIDE,
        {
          ruleId: "meta-ads-claims-unbeatable-001",
          reason: "approved by marketing copy review",
        },
      ],
    })
    expect(status).toBe(200)

    const types = events.map((e) => e.event)
    expect(types).not.toContain("policy_warned")
    expect(types).not.toContain("policy_blocked")
    expect(types[types.length - 1]).toBe("complete")

    const startedEvent = events.find((e) => e.event === "started")!
    const batchId = (startedEvent.data as { batchId: string }).batchId
    const batch = getBatchRepo().findById(batchId)
    expect(batch?.status).toBe("completed")
    expect(batch?.policyDecisionJson).not.toBeNull()
    const persisted = JSON.parse(batch!.policyDecisionJson!) as PolicyDecision
    expect(persisted.overrides).toHaveLength(2)
    for (const v of persisted.violations) {
      expect(v.details).toMatchObject({ overridden: true })
    }
  }, 10000)
})
