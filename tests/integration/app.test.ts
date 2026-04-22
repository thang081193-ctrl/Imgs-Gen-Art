// Integration smoke — real createApp() fetches via app.fetch (no port binding).
// Covers: health, providers, stub 501s, X-Request-Id header echo, error shape.

import { describe, expect, it } from "vitest"
import { createApp } from "@/server/app"
import { STUB_DOMAINS } from "@/server/routes/stubs"

const TEST_VERSION = "0.0.0-test"

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  const app = createApp({ version: TEST_VERSION })
  return app.fetch(new Request(`http://127.0.0.1${path}`, init))
}

describe("GET /api/health", () => {
  it("returns { status, version, uptimeMs } with 200 + JSON", async () => {
    const res = await fetchApp("/api/health")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type") ?? "").toContain("application/json")
    const body = await res.json()
    expect(body).toEqual({
      status: "ok",
      version: TEST_VERSION,
      uptimeMs: expect.any(Number),
    })
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0)
  })

  it("echoes X-Request-Id header (UUID shape)", async () => {
    const res = await fetchApp("/api/health")
    const id = res.headers.get("X-Request-Id")
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it("emits distinct request IDs across calls", async () => {
    const [a, b] = await Promise.all([fetchApp("/api/health"), fetchApp("/api/health")])
    expect(a.headers.get("X-Request-Id")).not.toBe(b.headers.get("X-Request-Id"))
  })
})

describe("GET /api/providers", () => {
  it("returns full catalog with mock registered", async () => {
    const res = await fetchApp("/api/providers")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["gemini", "vertex", "mock"])
    expect(body.models).toHaveLength(4)
    expect(body.registeredProviderIds).toEqual(["mock"])
  })

  it("embeds capability per model entry (sourceUrl + verifiedAt)", async () => {
    const res = await fetchApp("/api/providers")
    const body = await res.json()
    for (const model of body.models) {
      // sourceUrl is free-form string (real providers use HTTPS, mock uses "internal")
      expect(typeof model.capability.sourceUrl).toBe("string")
      expect(model.capability.sourceUrl.length).toBeGreaterThan(0)
      expect(model.capability.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
    }
  })
})

// Phase 3 Step 6 shipped every domain — STUB_DOMAINS is now []. When future
// phases register a new domain temporarily as a stub, these tests wake up
// automatically via the parametrized loop below.
describe.skipIf(STUB_DOMAINS.length === 0)(
  "Stub routes — /api/{domain} returns 501 NOT_IMPLEMENTED",
  () => {
    for (const domain of STUB_DOMAINS) {
      it(`${domain}: GET /api/${domain} → 501`, async () => {
        const res = await fetchApp(`/api/${domain}`)
        expect(res.status).toBe(501)
        const body = await res.json()
        expect(body.code).toBe("NOT_IMPLEMENTED")
        expect(body.message).toContain(`/api/${domain}`)
      })

      it(`${domain}: POST /api/${domain}/some-id → 501`, async () => {
        const res = await fetchApp(`/api/${domain}/abc`, { method: "POST" })
        expect(res.status).toBe(501)
        const body = await res.json()
        expect(body.code).toBe("NOT_IMPLEMENTED")
      })
    }
  },
)

describe("Unknown routes", () => {
  it("GET /api/nonexistent → 404 (Hono default, not 501)", async () => {
    const res = await fetchApp("/api/nonexistent")
    expect(res.status).toBe(404)
  })
})
