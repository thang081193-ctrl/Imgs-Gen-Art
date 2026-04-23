// Phase 4 Step 4 (Session #21) — health cache invalidation wiring.
//
// Verifies that the /api/keys routes fire `healthCache.invalidate(providerId)`
// after activate + delete operations so the next /providers/health call
// re-probes instead of returning stale status.
//
// Uses a stub probe to keep the suite hermetic. Keys store points at a
// mkdtempSync scope via IMAGES_GEN_ART_KEYS_PATH so real keys.enc isn't
// touched.

import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetHealthCacheForTests,
  initHealthCache,
} from "@/server/health"
import type { HealthStatus } from "@/core/providers/types"

const TEST_VERSION = "0.0.0-test"

let tmpRoot: string

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

function statusOk(): HealthStatus {
  return { status: "ok", latencyMs: 1, checkedAt: new Date().toISOString() }
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "iga-health-wiring-"))
  process.env.IMAGES_GEN_ART_KEYS_PATH = join(tmpRoot, "keys.enc")
})

afterAll(() => {
  delete process.env.IMAGES_GEN_ART_KEYS_PATH
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
})

describe("health cache — key mutation invalidation", () => {
  let probeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    _resetHealthCacheForTests()
    probeMock = vi.fn(async () => statusOk())
    initHealthCache({ probe: probeMock })
  })
  afterEach(() => _resetHealthCacheForTests())

  it("POST /api/keys (gemini create) invalidates gemini entries", async () => {
    // Prime cache for gemini + vertex
    await fetchApp("/api/providers/health")
    const baseCalls = probeMock.mock.calls.length

    // Create a new Gemini slot
    const create = await fetchApp("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", label: "t1", key: "AIzaFAKE" }),
    })
    expect(create.status).toBe(201)

    // Next gemini probe should re-run (invalidated); vertex + mock should stay cached.
    await fetchApp("/api/providers/health")
    const afterCalls = probeMock.mock.calls.length
    // Expect at least 2 gemini re-probes (NB Pro + NB 2 models).
    const newCalls = afterCalls - baseCalls
    expect(newCalls).toBeGreaterThanOrEqual(2)
    // All new calls are for gemini only.
    const newCallProviders = probeMock.mock.calls.slice(baseCalls).map((c) => c[0])
    expect(new Set(newCallProviders)).toEqual(new Set(["gemini"]))
  })

  it("POST /api/keys/:id/activate invalidates the target provider", async () => {
    // Seed two Gemini slots so there's something to flip between.
    const r1 = await fetchApp("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", label: "s1", key: "AIzaFAKE_1" }),
    })
    const slotId1 = (await r1.json() as { slotId: string }).slotId

    const r2 = await fetchApp("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", label: "s2", key: "AIzaFAKE_2" }),
    })
    const slotId2 = (await r2.json() as { slotId: string }).slotId
    void slotId1

    await fetchApp("/api/providers/health?provider=gemini")
    const before = probeMock.mock.calls.length

    // Activate slot2 — fires invalidate("gemini")
    const act = await fetchApp(`/api/keys/${slotId2}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    expect(act.status).toBe(200)

    await fetchApp("/api/providers/health?provider=gemini")
    const after = probeMock.mock.calls.length
    expect(after).toBeGreaterThan(before)
  })

  it("DELETE /api/keys/:id invalidates the target provider", async () => {
    const r = await fetchApp("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", label: "del-me", key: "AIzaFAKE" }),
    })
    const slotId = (await r.json() as { slotId: string }).slotId

    await fetchApp("/api/providers/health?provider=gemini")
    const before = probeMock.mock.calls.length

    const del = await fetchApp(`/api/keys/${slotId}`, { method: "DELETE" })
    expect([200, 204]).toContain(del.status)

    await fetchApp("/api/providers/health?provider=gemini")
    const after = probeMock.mock.calls.length
    expect(after).toBeGreaterThan(before)
  })
})
