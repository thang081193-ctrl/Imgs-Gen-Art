// Session #17 Step 9 — HTTP-layer cancel E2E.
//
// Exercises the dispatcher grace-window fix (Session #16) via the route
// layer: start a 10-asset artwork-batch, DELETE /runs/:batchId once the
// `started` frame lands, drain the stream, assert:
//   - terminal event is `aborted` (not `error` or hang)
//   - batch.status === "aborted" + partial assets saved
//   - health endpoint still responsive (no hung handler)
//
// Uses MOCK_DELAY_MS=150 so a 10-batch runs ~1.5s — a window wide enough
// to land a DELETE after the first image but before completion. Integration
// test only — env override is scoped to this file via beforeAll/afterAll.

import { existsSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  getAssetRepo,
  getBatchRepo,
  initAssetStore,
} from "@/server/asset-store/context"
import { preloadAllTemplates } from "@/server/templates"
import { _resetAbortRegistryForTests } from "@/server/workflows-runtime/abort-registry"

const TEST_VERSION = "0.0.0-test"
const ASSET_CLEANUP = resolve(process.cwd(), "data", "assets", "chartlens")
let priorMockDelay: string | undefined

function freshApp() {
  return createApp({ version: TEST_VERSION })
}

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  return freshApp().fetch(new Request(`http://127.0.0.1${path}`, init))
}

function parseSSEBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split(/\n/)
  let ev = ""
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith("event: ")) ev = line.slice(7)
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6))
  }
  if (!ev) return null
  const data: unknown = dataLines.length > 0 ? JSON.parse(dataLines.join("\n")) : null
  return { event: ev, data }
}

beforeAll(() => {
  preloadAllTemplates()
  priorMockDelay = process.env.MOCK_DELAY_MS
  process.env.MOCK_DELAY_MS = "150"
})

afterAll(() => {
  if (priorMockDelay === undefined) delete process.env.MOCK_DELAY_MS
  else process.env.MOCK_DELAY_MS = priorMockDelay
})

beforeEach(() => {
  _resetAbortRegistryForTests()
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  if (existsSync(ASSET_CLEANUP)) rmSync(ASSET_CLEANUP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

describe("DELETE /api/workflows/runs/:batchId — mid-flight cancel E2E", () => {
  it(
    "cancel after `started` → stream ends with `aborted`, batch status aborted, health still ok",
    async () => {
      const app = freshApp()

      // Start a 10-asset batch. The same `app` instance serves both the POST
      // (long-lived SSE) and the DELETE — critical because abort-registry
      // lives on module state shared across requests on the same app.
      const runRes = await app.fetch(
        new Request("http://127.0.0.1/api/workflows/artwork-batch/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: "chartlens",
            providerId: "mock",
            modelId: "mock-fast",
            aspectRatio: "1:1",
            // memory group may have fewer than 10 items (pickConcepts
            // clamps). Use 4 × 3 = 12 total — wide enough for grace-window
            // exercise regardless of group pool size.
            input: {
              group: "memory",
              subjectDescription: "cancel-test",
              conceptCount: 4,
              variantsPerConcept: 3,
              seed: 42,
            },
          }),
        }),
      )
      expect(runRes.status).toBe(200)
      expect(runRes.headers.get("Content-Type") ?? "").toContain("text/event-stream")

      const reader = runRes.body?.getReader()
      if (!reader) throw new Error("no body reader")
      const decoder = new TextDecoder()
      const events: { event: string; data: unknown }[] = []
      let buffer = ""
      let batchId = ""
      let deleted = false

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        while (buffer.includes("\n\n")) {
          const idx = buffer.indexOf("\n\n")
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const parsed = parseSSEBlock(block)
          if (!parsed) continue
          events.push(parsed)

          // Capture batchId from `started`, then fire DELETE after the
          // first image lands (ensures at least one partial asset saved).
          if (parsed.event === "started") {
            const d = parsed.data as { batchId: string }
            batchId = d.batchId
          }
          if (!deleted && parsed.event === "image_generated") {
            deleted = true
            const delRes = await app.fetch(
              new Request(`http://127.0.0.1/api/workflows/runs/${batchId}`, {
                method: "DELETE",
              }),
            )
            expect(delRes.status).toBe(204)
          }

          if (parsed.event === "aborted" || parsed.event === "complete" || parsed.event === "error") {
            // Terminal frame — don't read further even if bytes remain.
            break
          }
        }
      }

      // Terminal frame must be aborted. Grace-window fix guarantees the
      // workflow emits it within POST_ABORT_GRACE events of the abort flag.
      const terminal = events[events.length - 1]
      expect(terminal?.event).toBe("aborted")
      const abortData = terminal!.data as {
        batchId: string
        completedCount: number
        totalCount: number
      }
      expect(abortData.batchId).toBe(batchId)
      expect(abortData.totalCount).toBe(12)
      expect(abortData.completedCount).toBeGreaterThanOrEqual(1)
      expect(abortData.completedCount).toBeLessThan(12)

      // DB state reflects abort with partial asset count.
      const batch = getBatchRepo().findById(batchId)
      expect(batch?.status).toBe("aborted")
      expect(batch?.successfulAssets).toBe(abortData.completedCount)

      // Partial assets persisted with valid batchId linkage.
      const saved = getAssetRepo().list({ batchId, limit: 100 })
      expect(saved.length).toBe(abortData.completedCount)

      // Health still responsive — no hung handler / deadlocked registry.
      const health = await app.fetch(new Request("http://127.0.0.1/api/health"))
      expect(health.status).toBe(200)
    },
    15000,
  )

  it("DELETE unknown batchId → 404 BATCH_NOT_FOUND", async () => {
    const res = await fetchApp("/api/workflows/runs/batch_never_existed_x", {
      method: "DELETE",
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("BATCH_NOT_FOUND")
  })
})
