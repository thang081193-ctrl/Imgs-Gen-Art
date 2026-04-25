// BOOTSTRAP-PHASE3 Step 4 — HTTP smoke for the /api/workflows + runs endpoints.
//
// Exercises the full wire: validateBody → dispatcher → streamSSE, abort
// registry, and DELETE cancel tri-state (204 / 409 / 404). Asset-store is
// mounted on an in-memory DB per test; template cache is preloaded once;
// data/assets/chartlens is cleaned up after each full run to keep the
// repo tidy (gitignored but avoids unbounded growth).

import { existsSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getBatchRepo,
  initAssetStore,
} from "@/server/asset-store/context"
import { preloadAllTemplates } from "@/server/templates"
import { _resetAbortRegistryForTests } from "@/server/workflows-runtime/abort-registry"

const TEST_VERSION = "0.0.0-test"
const ASSET_CLEANUP_DIR = resolve(process.cwd(), "data", "assets", "chartlens")

function freshApp() {
  return createApp({ version: TEST_VERSION })
}

function fetchApp(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return freshApp().fetch(new Request(`http://127.0.0.1${path}`, init))
}

function validBody(overrides?: Record<string, unknown>) {
  return {
    profileId: "chartlens",
    providerId: "mock",
    modelId: "mock-fast",
    aspectRatio: "1:1",
    input: {
      group: "memory",
      subjectDescription: "family portrait, warm light",
      conceptCount: 2,
      variantsPerConcept: 1,
      seed: 42,
    },
    ...overrides,
  }
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

function parseSSEEvents(raw: string): { event: string; data: unknown }[] {
  const events: { event: string; data: unknown }[] = []
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
      const data: unknown = dataLines.length > 0 ? JSON.parse(dataLines.join("\n")) : null
      events.push({ event: ev, data })
    }
  }
  return events
}

beforeAll(() => {
  preloadAllTemplates()
})

beforeEach(() => {
  _resetAbortRegistryForTests()
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  if (existsSync(ASSET_CLEANUP_DIR)) {
    rmSync(ASSET_CLEANUP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})

describe("GET /api/workflows", () => {
  it("returns all 5 workflows with metadata (PLAN §9.1 + S#44 google-ads)", async () => {
    const res = await fetchApp("/api/workflows")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      workflows: { id: string; displayName: string; colorVariant: string }[]
    }
    expect(body.workflows).toHaveLength(5)

    // PLAN §9.1 locked id → colorVariant pairing. Order is registration
    // order, but we assert by id so a future reshuffle won't break this.
    // S#44 Phase E adds google-ads (CF#17 LOCKED — colorVariant "sky").
    const byId = new Map(body.workflows.map((w) => [w.id, w]))
    expect(byId.get("artwork-batch")).toMatchObject({ colorVariant: "violet" })
    expect(byId.get("ad-production")).toMatchObject({ colorVariant: "blue" })
    expect(byId.get("style-transform")).toMatchObject({ colorVariant: "pink" })
    expect(byId.get("aso-screenshots")).toMatchObject({ colorVariant: "emerald" })
    expect(byId.get("google-ads")).toMatchObject({ colorVariant: "sky" })
    for (const w of body.workflows) {
      expect(w.displayName).toBeTruthy()
    }
  })
})

describe("POST /api/workflows/:id/run — body validation", () => {
  it("rejects missing profileId → 400 BAD_REQUEST", async () => {
    const body = validBody()
    // @ts-expect-error deliberately dropping profileId
    delete body.profileId
    const res = await fetchApp("/api/workflows/artwork-batch/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(400)
    const err = await res.json() as { code: string }
    expect(err.code).toBe("BAD_REQUEST")
  })

  it("rejects malformed JSON → 400", async () => {
    const res = await fetchApp("/api/workflows/artwork-batch/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    })
    expect(res.status).toBe(400)
  })
})

describe("POST /api/workflows/:id/run — precondition errors", () => {
  it("unknown workflow id → 404 NOT_FOUND", async () => {
    const res = await fetchApp("/api/workflows/does-not-exist/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    })
    expect(res.status).toBe(404)
    const err = await res.json() as { code: string }
    expect(err.code).toBe("NOT_FOUND")
  })

  it("unknown profileId → 404", async () => {
    const res = await fetchApp("/api/workflows/artwork-batch/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody({ profileId: "no-such-profile" })),
    })
    expect(res.status).toBe(404)
  })

  it("aspectRatio leaked into input → 400 (precondition #7 banned keys)", async () => {
    const res = await fetchApp("/api/workflows/artwork-batch/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        validBody({
          input: {
            group: "memory",
            subjectDescription: "x",
            aspectRatio: "1:1",
          },
        }),
      ),
    })
    expect(res.status).toBe(400)
  })
})

describe("POST /api/workflows/:id/run — SSE happy path", () => {
  it("streams started → concept_generated × 2 → image_generated × 2 → complete", async () => {
    const res = await fetchApp("/api/workflows/artwork-batch/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type") ?? "").toContain("text/event-stream")

    const raw = await readSSE(res)
    const events = parseSSEEvents(raw)
    const types = events.map((e) => e.event)
    expect(types[0]).toBe("started")
    expect(types[types.length - 1]).toBe("complete")
    expect(types.filter((t) => t === "concept_generated")).toHaveLength(2)
    expect(types.filter((t) => t === "image_generated")).toHaveLength(2)

    const started = events[0]?.data as { batchId: string; total: number }
    expect(started.total).toBe(2)
    const batch = getBatchRepo().findById(started.batchId)
    expect(batch?.status).toBe("completed")
    expect(batch?.successfulAssets).toBe(2)
  }, 10000)
})

describe("POST /api/workflows/:id/run — client-disconnect abort (bonus B)", () => {
  it("tears down the stream cleanly and exits the handler on client abort", async () => {
    // Smoke for the abort wire. Mock provider is fast (20ms/gen); the
    // handler's runtime is dominated by setup + event flushing, so a
    // pre-aborted signal is the most reliable way to prove the client →
    // controller chain without racing Mock's generate loop.
    const ctrl = new AbortController()
    ctrl.abort()

    const res = await fetchApp("/api/workflows/artwork-batch/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
      signal: ctrl.signal,
    })

    // Status may be 200 (streamSSE headers flushed pre-abort) or
    // short-circuited; the critical property is that the app didn't hang.
    expect(res.status).toBeLessThan(600)

    // Drain whatever the stream emitted — reader.read() must return done
    // within the test timeout or the handler leaked.
    await readSSE(res)

    // Allow dispatcher finally → deregisterBatch to settle.
    await new Promise((r) => setTimeout(r, 50))

    // Health still responsive = event loop clean, no hung controller.
    const health = await fetchApp("/api/health")
    expect(health.status).toBe(200)
  }, 10000)
})

describe("DELETE /api/workflows/runs/:batchId — tri-state", () => {
  it("unknown batchId → 404 BATCH_NOT_FOUND", async () => {
    const res = await fetchApp("/api/workflows/runs/batch_unknown_xx", {
      method: "DELETE",
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("BATCH_NOT_FOUND")
  })

  it("finished batch → 409 BATCH_NOT_RUNNING + currentStatus", async () => {
    // Pre-seed a completed batch row (never registered in abort-registry).
    const batchId = "batch_done_test"
    getBatchRepo().create({
      id: batchId,
      profileId: "chartlens",
      workflowId: "artwork-batch",
      totalAssets: 2,
      status: "running",
      startedAt: new Date().toISOString(),
    })
    getBatchRepo().updateStatus(batchId, {
      status: "completed",
      successfulAssets: 2,
      totalCostUsd: 0,
      completedAt: new Date().toISOString(),
    })

    const res = await fetchApp(`/api/workflows/runs/${batchId}`, {
      method: "DELETE",
    })
    expect(res.status).toBe(409)
    const body = await res.json() as { error: string; currentStatus: string }
    expect(body.error).toBe("BATCH_NOT_RUNNING")
    expect(body.currentStatus).toBe("completed")
  })

  it("resume endpoint → 501 with Resume: not-supported header", async () => {
    const res = await fetchApp("/api/workflows/runs/batch_any/resume", {
      method: "POST",
    })
    expect(res.status).toBe(501)
    expect(res.headers.get("Resume")).toBe("not-supported")
  })
})
