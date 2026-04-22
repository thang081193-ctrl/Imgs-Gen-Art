// BOOTSTRAP-PHASE3 Step 5 — HTTP smoke for the Step 5 extensions to
// /api/providers (existing GET / catalog covered by app.test.ts).
//
// /compatibility — real matrix computation (no stubs). Asserts matrix has
// an entry for every registered workflow and every model, with
// status="compatible"|"incompatible".
//
// /health — stubbed per Session #13 Q4. Four modes:
//   1. no filters          → full matrix
//   2. ?provider=X         → subtree
//   3. ?provider=X&model=Y → flat HealthStatus
//   4. ?model=Y alone      → 400 MODEL_REQUIRES_PROVIDER

import { describe, expect, it } from "vitest"

import { createApp } from "@/server/app"

const TEST_VERSION = "0.0.0-test"

function fetchApp(path: string): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`))
}

describe("GET /api/providers/compatibility", () => {
  it("returns matrix keyed by workflowId with per-model entries", async () => {
    const res = await fetchApp("/api/providers/compatibility")
    expect(res.status).toBe(200)
    const body = await res.json() as {
      matrix: Record<string, Record<string, { status: string; score: number }>>
    }
    expect(body.matrix).toBeDefined()
    expect(body.matrix["artwork-batch"]).toBeDefined()

    const ab = body.matrix["artwork-batch"]
    expect(ab).toBeDefined()
    // 4 models: gemini-3-pro, gemini-3.1-flash, imagen-4, mock-fast
    expect(Object.keys(ab ?? {})).toHaveLength(4)

    // Mock model MUST be compatible with artwork-batch (it's the Phase 3 driver).
    const mockEntry = ab?.["mock:mock-fast"]
    expect(mockEntry?.status).toBe("compatible")
  })
})

describe("GET /api/providers/health — stubbed", () => {
  it("no filters → full matrix keyed provider → model", async () => {
    const res = await fetchApp("/api/providers/health")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, Record<string, { status: string }>>
    expect(body.mock).toBeDefined()
    expect(body.mock?.["mock-fast"]?.status).toBe("ok")
    expect(body.gemini).toBeDefined()
    expect(body.vertex).toBeDefined()
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
      message?: string
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
})
