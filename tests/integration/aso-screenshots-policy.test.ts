// Phase F1 (Session #44) — integration test for aso-screenshots policy SSE.
//
// Drives `POST /api/workflows/aso-screenshots/run` end-to-end against
// the real play-aso.json hand-curated rule set. Same vi.mock loader
// pattern as D1's ad-production-policy suite — keeps the test off the
// shared data/profiles/ dir to avoid racing profiles-routes.
//
// Note on the `play-screenshot-aspect-001` rule: ratio "1:1" is NOT in
// its allowed list (9:16, 16:9), so it surfaces as a baseline warning
// at every preflight. Tests that need the wire policy-quiet send an
// override for it; aspect-ratio-respecting runs don't trip that rule.

import { existsSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { PolicyDecision } from "@/core/schemas/policy-decision"
import type { AppProfile } from "@/core/schemas/app-profile"
import { NotFoundError } from "@/core/shared/errors"

const TEST_PROFILES = new Map<string, AppProfile>()

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
const ASSETS_CLEANUP = resolve(process.cwd(), "data", "assets")

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

async function runBatch(opts: {
  profileId: string
  policyOverrides?: { ruleId: string; reason: string }[]
}): Promise<{ status: number; events: ParsedSSE[] }> {
  const body: Record<string, unknown> = {
    profileId: opts.profileId,
    providerId: "mock",
    modelId: "mock-fast",
    aspectRatio: "9:16",
    input: {
      conceptCount: 1,
      variantsPerConcept: 1,
      targetLangs: ["en"],
      seed: 7,
    },
  }
  if (opts.policyOverrides) body["policyOverrides"] = opts.policyOverrides
  const res = await fetchApp("/api/workflows/aso-screenshots/run", {
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

beforeEach(() => {
  _resetAbortRegistryForTests()
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
  resetPolicyRulesCacheForTests()
})

const TEST_PROFILE_IDS = [
  "f1-block-free-download",
  "f1-warn-five-stars",
  "f1-clean",
] as const

afterEach(() => {
  for (const id of TEST_PROFILE_IDS) {
    const dir = join(ASSETS_CLEANUP, id)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }
})

describe("aso-screenshots policy SSE — block / warning / clean", () => {
  it("block: 'free download' in doList → policy_blocked + error(PolicyBlocked); batch row = error", async () => {
    registerProfile({ id: "f1-block-free-download", doList: ["free download"] })
    const { status, events } = await runBatch({ profileId: "f1-block-free-download" })
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
    const persisted = JSON.parse(batch!.policyDecisionJson!) as PolicyDecision
    expect(persisted.violations.some((v) => v.ruleId === "play-incentives-free-download-001")).toBe(true)
  }, 10000)

  it("warning: '5 stars' in doList → policy_warned BEFORE image_generated; batch completes", async () => {
    registerProfile({ id: "f1-warn-five-stars", doList: ["5 stars"] })
    const { status, events } = await runBatch({ profileId: "f1-warn-five-stars" })
    expect(status).toBe(200)

    const types = events.map((e) => e.event)
    const warnIdx = types.indexOf("policy_warned")
    const imgIdx = types.indexOf("image_generated")
    expect(warnIdx).toBeGreaterThan(-1)
    expect(imgIdx).toBeGreaterThan(warnIdx)
    expect(types[types.length - 1]).toBe("complete")

    const startedEvent = events.find((e) => e.event === "started")!
    const batchId = (startedEvent.data as { batchId: string }).batchId
    const batch = getBatchRepo().findById(batchId)
    expect(batch?.status).toBe("completed")
    const persisted = JSON.parse(batch!.policyDecisionJson!) as PolicyDecision
    expect(
      persisted.violations.some(
        (v) => v.ruleId === "play-rating-manipulation-five-stars-001",
      ),
    ).toBe(true)
  }, 10000)

  it("baseline (no D1-style trigger): aspect-ratio compliant 9:16 → clean wire, audit NULL", async () => {
    // Note: 9:16 IS in the play-screenshot-aspect-001 allowed list, so
    // even without overrides the wire stays quiet.
    registerProfile({ id: "f1-clean", doList: ["clean grid"] })
    const { status, events } = await runBatch({ profileId: "f1-clean" })
    expect(status).toBe(200)

    const types = events.map((e) => e.event)
    expect(types).not.toContain("policy_warned")
    expect(types).not.toContain("policy_blocked")
    expect(types[types.length - 1]).toBe("complete")

    const startedEvent = events.find((e) => e.event === "started")!
    const batchId = (startedEvent.data as { batchId: string }).batchId
    const batch = getBatchRepo().findById(batchId)
    expect(batch?.status).toBe("completed")
    expect(batch?.policyDecisionJson).toBeNull()
  }, 10000)
})
