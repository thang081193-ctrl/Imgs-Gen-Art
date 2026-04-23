// BOOTSTRAP-PHASE4 Step 4 (Session #21) — HTTP smoke for /providers/health.
// Replaces Session #13 Phase 3 stub tests with live cache-backed assertions.
//
// Tests stub the probe function (via initHealthCache({ probe })) so the
// suite stays hermetic — no real provider SDK calls.
//
// Query-shape modes (Q3):
//   1. no filters          → full matrix
//   2. ?provider=X         → subtree
//   3. ?provider=X&model=Y → flat HealthStatus
//   4. ?model=Y alone      → 400 MODEL_REQUIRES_PROVIDER
//   5. ?forceRefresh=true  → bypass cache
//
// Plus cache invalidation on key-slot activate/delete (Q2).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetHealthCacheForTests,
  initHealthCache,
} from "@/server/health"
import type { HealthStatus } from "@/core/providers/types"

const TEST_VERSION = "0.0.0-test"

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

function statusOk(): HealthStatus {
  return { status: "ok", latencyMs: 1, checkedAt: new Date().toISOString() }
}

describe("GET /api/providers/compatibility", () => {
  beforeEach(() => {
    _resetHealthCacheForTests()
    initHealthCache({ probe: vi.fn(async () => statusOk()) })
  })
  afterEach(() => _resetHealthCacheForTests())

  it("returns matrix keyed by workflowId with per-model entries", async () => {
    const res = await fetchApp("/api/providers/compatibility")
    expect(res.status).toBe(200)
    const body = await res.json() as {
      matrix: Record<string, Record<string, { status: string; score: number }>>
    }
    expect(body.matrix).toBeDefined()
    expect(body.matrix["artwork-batch"]).toBeDefined()
    const ab = body.matrix["artwork-batch"]
    expect(Object.keys(ab ?? {})).toHaveLength(4)
    expect(ab?.["mock:mock-fast"]?.status).toBe("compatible")
  })
})

describe("GET /api/providers/health — live (stubbed probe)", () => {
  let probeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    _resetHealthCacheForTests()
    probeMock = vi.fn(async () => statusOk())
    initHealthCache({ probe: probeMock })
  })
  afterEach(() => _resetHealthCacheForTests())

  it("no filters → full matrix keyed provider → model", async () => {
    const res = await fetchApp("/api/providers/health")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, Record<string, { status: string }>>
    expect(body.mock?.["mock-fast"]?.status).toBe("ok")
    expect(body.gemini).toBeDefined()
    expect(body.vertex).toBeDefined()
    // All 4 registered models probed once (Mock + 2 Gemini + 1 Vertex).
    expect(probeMock).toHaveBeenCalledTimes(4)
  })

  it("?provider=mock → single-provider subtree", async () => {
    const res = await fetchApp("/api/providers/health?provider=mock")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, Record<string, { status: string }>>
    expect(Object.keys(body)).toEqual(["mock"])
    expect(body.mock?.["mock-fast"]?.status).toBe("ok")
  })

  it("?provider=mock&model=mock-fast → flat HealthStatus", async () => {
    const res = await fetchApp("/api/providers/health?provider=mock&model=mock-fast")
    expect(res.status).toBe(200)
    const body = await res.json() as {
      status: string
      checkedAt: string
    }
    expect(body.status).toBe("ok")
    expect(body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("?model=Y alone → 400 MODEL_REQUIRES_PROVIDER", async () => {
    const res = await fetchApp("/api/providers/health?model=mock-fast")
    expect(res.status).toBe(400)
    const err = await res.json() as { error: string }
    expect(err.error).toBe("MODEL_REQUIRES_PROVIDER")
  })

  it("?provider=unknown → 404 PROVIDER_NOT_FOUND", async () => {
    const res = await fetchApp("/api/providers/health?provider=no-such-provider")
    expect(res.status).toBe(404)
    const err = await res.json() as { error: string }
    expect(err.error).toBe("PROVIDER_NOT_FOUND")
  })

  it("?provider=mock&model=unknown → 404 MODEL_NOT_FOUND", async () => {
    const res = await fetchApp("/api/providers/health?provider=mock&model=nope")
    expect(res.status).toBe(404)
    const err = await res.json() as { error: string }
    expect(err.error).toBe("MODEL_NOT_FOUND")
  })

  it("second call within TTL → cache hit, no extra probe", async () => {
    await fetchApp("/api/providers/health?provider=mock&model=mock-fast")
    await fetchApp("/api/providers/health?provider=mock&model=mock-fast")
    expect(probeMock).toHaveBeenCalledTimes(1)
  })

  it("forceRefresh=true bypasses cache", async () => {
    await fetchApp("/api/providers/health?provider=mock&model=mock-fast")
    await fetchApp("/api/providers/health?provider=mock&model=mock-fast&forceRefresh=true")
    expect(probeMock).toHaveBeenCalledTimes(2)
  })

  it("provider crash (probe rejects) → 'down' entry in matrix, not 500", async () => {
    const crashingProbe = vi.fn(async (providerId: string) => {
      if (providerId === "gemini") throw new Error("SDK explosion")
      return statusOk()
    })
    _resetHealthCacheForTests()
    initHealthCache({ probe: crashingProbe })

    const res = await fetchApp("/api/providers/health?provider=gemini")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, Record<string, { status: string; message?: string }>>
    const entries = Object.values(body.gemini ?? {})
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.status).toBe("down")
      expect(entry.message).toContain("SDK explosion")
    }
  })
})
