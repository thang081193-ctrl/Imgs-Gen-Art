// Phase C3 (Session #43) — POST /api/policy-rules/preflight integration.
//
// Mounts the route factory with a stubbed `preflight` so the test asserts
// the wire shape + body validation without depending on disk-loaded
// rules. Mirrors policy-rules-rescrape-route.test.ts patterns.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "@/server/app"
import {
  _resetAssetStoreForTests,
  initAssetStore,
} from "@/server/asset-store"
import type { PolicyDecision } from "@/core/schemas/policy-decision"
import { preloadAllTemplates } from "@/server/templates"
import { createPolicyRulesRoute } from "@/server/routes/policy-rules"

const TEST_VERSION = "0.0.0-test"

function freshApp() {
  return createApp({ version: TEST_VERSION })
}

function fetchApp(path: string, init?: RequestInit): Promise<Response> {
  return freshApp().fetch(new Request(`http://127.0.0.1${path}`, init))
}

beforeAll(() => {
  preloadAllTemplates()
})

beforeEach(() => {
  _resetAssetStoreForTests()
  initAssetStore({ path: ":memory:" })
})

afterEach(() => {
  _resetAssetStoreForTests()
})

describe("POST /api/policy-rules/preflight", () => {
  it("happy path: returns the PolicyDecision from the aggregator", async () => {
    const fakeDecision: PolicyDecision = {
      decidedAt: "2026-04-25T10:00:00.000Z",
      ok: true,
      violations: [],
    }
    const preflight = vi.fn(() => fakeDecision)
    const customRoute = createPolicyRulesRoute({ preflight })

    const res = await customRoute.fetch(
      new Request("http://127.0.0.1/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: "meta", prompt: "hello" }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as PolicyDecision
    expect(body).toEqual(fakeDecision)

    // Asset-* fields not provided → undefined keys (route strips
    // explicit undefined off the input object — the test asserts the
    // forwarded shape contains only what the body supplied).
    expect(preflight).toHaveBeenCalledTimes(1)
    const [input] = preflight.mock.calls[0]!
    expect(input.platform).toBe("meta")
    expect(input.prompt).toBe("hello")
  })

  it("forwards overrides through to the aggregator body arg", async () => {
    const fakeDecision: PolicyDecision = {
      decidedAt: "2026-04-25T10:00:00.000Z",
      ok: true,
      violations: [],
      overrides: [{ ruleId: "r1", reason: "ok" }],
    }
    const preflight = vi.fn(() => fakeDecision)
    const customRoute = createPolicyRulesRoute({ preflight })

    await customRoute.fetch(
      new Request("http://127.0.0.1/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: "meta",
          prompt: "x",
          overrides: [{ ruleId: "r1", reason: "ok" }],
        }),
      }),
    )
    const [, bodyArg] = preflight.mock.calls[0]!
    expect(bodyArg.overrides).toEqual([{ ruleId: "r1", reason: "ok" }])
  })

  it("400 on unknown platform value", async () => {
    const res = await fetchApp("/api/policy-rules/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "bogus" }),
    })
    expect(res.status).toBe(400)
  })

  it("400 on extra unknown body field (strict)", async () => {
    const res = await fetchApp("/api/policy-rules/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "meta", extra: "no" }),
    })
    expect(res.status).toBe(400)
  })

  it("400 on malformed assetAspectRatio", async () => {
    const res = await fetchApp("/api/policy-rules/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "meta", assetAspectRatio: "16x9" }),
    })
    expect(res.status).toBe(400)
  })

  it("400 on negative assetWidth", async () => {
    const res = await fetchApp("/api/policy-rules/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "meta", assetWidth: -1 }),
    })
    expect(res.status).toBe(400)
  })

  it("happy path with full asset-* metadata forwards correctly", async () => {
    const fakeDecision: PolicyDecision = {
      decidedAt: "2026-04-25T10:00:00.000Z",
      ok: false,
      violations: [
        {
          ruleId: "r-block",
          severity: "block",
          kind: "aspect-ratio",
          message: "bad ar",
        },
      ],
    }
    const preflight = vi.fn(() => fakeDecision)
    const customRoute = createPolicyRulesRoute({ preflight })

    const res = await customRoute.fetch(
      new Request("http://127.0.0.1/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: "meta",
          prompt: "x",
          copyTexts: ["headline", "body"],
          assetWidth: 1024,
          assetHeight: 768,
          assetFileSizeBytes: 100000,
          assetAspectRatio: "4:3",
        }),
      }),
    )
    expect(res.status).toBe(200)
    const [input] = preflight.mock.calls[0]!
    expect(input).toMatchObject({
      platform: "meta",
      prompt: "x",
      copyTexts: ["headline", "body"],
      assetWidth: 1024,
      assetHeight: 768,
      assetFileSizeBytes: 100000,
      assetAspectRatio: "4:3",
    })
  })
})
