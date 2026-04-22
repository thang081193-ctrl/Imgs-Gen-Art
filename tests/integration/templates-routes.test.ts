// BOOTSTRAP-PHASE3 Step 5 — HTTP smoke for /api/templates.
//
// Happy path: 6 GET endpoints return the Phase 2 extracted JSON. Content
// sanity is sampled (schemaVersion = 1) rather than full-matched because
// template-schemas.test.ts already validates shape exhaustively.
//
// Read-only paranoid: non-GET methods on a registered path — Hono's
// default behavior for unmatched method is 404 (no auto-405). The test
// asserts a 4xx rejection either way so intent is clear but we're not
// pinned to an exact status if Hono's internals change.

import { beforeAll, describe, expect, it } from "vitest"

import { createApp } from "@/server/app"
import { preloadAllTemplates, _resetTemplateCacheForTests } from "@/server/templates"

const TEST_VERSION = "0.0.0-test"

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

beforeAll(() => {
  _resetTemplateCacheForTests()
  preloadAllTemplates()
})

describe("GET /api/templates/* — happy path", () => {
  const cases: { path: string; topKey: string }[] = [
    { path: "/api/templates/artwork-groups", topKey: "groups" },
    { path: "/api/templates/ad-layouts", topKey: "layouts" },
    { path: "/api/templates/country-profiles", topKey: "countries" },
    { path: "/api/templates/style-dna", topKey: "styles" },
    { path: "/api/templates/i18n", topKey: "strings" },
    { path: "/api/templates/copy", topKey: "templates" },
  ]

  for (const { path, topKey } of cases) {
    it(`GET ${path} returns JSON with top-level ${topKey}`, async () => {
      const res = await fetchApp(path)
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      expect(body.schemaVersion).toBe(1)
      expect(body[topKey]).toBeDefined()
      expect(typeof body[topKey]).toBe("object")
    })
  }
})

describe("read-only enforcement", () => {
  it("POST /api/templates/i18n is rejected (4xx — not implemented)", async () => {
    const res = await fetchApp("/api/templates/i18n", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it("DELETE /api/templates/style-dna is rejected (4xx — not implemented)", async () => {
    const res = await fetchApp("/api/templates/style-dna", { method: "DELETE" })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it("GET /api/templates/unknown-template → 404", async () => {
    const res = await fetchApp("/api/templates/unknown-template")
    expect(res.status).toBe(404)
  })
})
