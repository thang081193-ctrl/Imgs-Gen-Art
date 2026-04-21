// SSE wiring test — happy path + abort propagation (CRITICAL for Phase 3
// workflow dispatcher, which reuses the same AbortSignal pattern).

import { describe, expect, it } from "vitest"
import { createApp } from "@/server/app"

function fetchSSE(signal?: AbortSignal): Promise<Response> {
  const app = createApp({ version: "0.0.0-test" })
  const init: RequestInit = signal !== undefined ? { signal } : {}
  return app.fetch(new Request("http://127.0.0.1/api/debug/sse-echo", init))
}

async function readAllTicks(res: Response): Promise<string> {
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

describe("GET /api/debug/sse-echo — happy path", () => {
  it("streams 3 tick events with text/event-stream content type", async () => {
    const res = await fetchSSE()
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type") ?? "").toContain("text/event-stream")

    const body = await readAllTicks(res)
    const tickMatches = body.match(/event: tick/g) ?? []
    expect(tickMatches).toHaveLength(3)
    // Each tick carries { tick, timestamp } JSON
    expect(body).toMatch(/"tick":0/)
    expect(body).toMatch(/"tick":1/)
    expect(body).toMatch(/"tick":2/)
  }, 5000)
})

describe("GET /api/debug/sse-echo — abort propagation", () => {
  it("receives fewer than 3 ticks when aborted mid-stream, health still responsive", async () => {
    const app = createApp({ version: "0.0.0-test" })
    const ac = new AbortController()

    const resPromise = app.fetch(
      new Request("http://127.0.0.1/api/debug/sse-echo", { signal: ac.signal }),
    )

    setTimeout(() => ac.abort(), 100)

    let body = ""
    try {
      const res = await resPromise
      body = await readAllTicks(res)
    } catch {
      // aborted fetch may reject — acceptable
    }

    const tickMatches = body.match(/event: tick/g) ?? []
    expect(tickMatches.length).toBeLessThan(3)

    // Wait for any pending cleanup then verify no hung handler
    await new Promise((r) => setTimeout(r, 300))

    const healthRes = await app.fetch(new Request("http://127.0.0.1/api/health"))
    expect(healthRes.status).toBe(200)
    const healthBody = await healthRes.json()
    expect(healthBody.status).toBe("ok")
  }, 5000)
})
