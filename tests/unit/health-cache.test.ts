// Phase 4 Step 4 (Session #21) — health cache mechanics.
//
// Covers: cache hit / miss + TTL per status / forceRefresh / in-flight dedup
// / invalidate(providerId) scope / invalidateAll / peek.
//
// Uses injectable `now` + stub `probe` so tests are deterministic and
// don't depend on real providers or wall-clock timing.

import { describe, expect, it, vi } from "vitest"
import { createHealthCache, TTL_BY_STATUS } from "@/server/health/cache"
import type { HealthStatus } from "@/core/providers/types"

function buildStatus(status: HealthStatus["status"], latencyMs = 10): HealthStatus {
  return {
    status,
    latencyMs,
    checkedAt: "2026-04-23T00:00:00.000Z",
  }
}

describe("health-cache — basic hit/miss", () => {
  it("cold get calls probe + populates cache", async () => {
    const probe = vi.fn(async () => buildStatus("ok"))
    let time = 1000
    const cache = createHealthCache({ probe, now: () => time })

    const first = await cache.get("gemini", "m1")
    expect(first.status).toBe("ok")
    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith("gemini", "m1")

    const entry = cache.peek("gemini", "m1")
    expect(entry).not.toBeNull()
    expect(entry?.probedAt).toBe(1000)
    expect(entry?.expiresAt).toBe(1000 + TTL_BY_STATUS.ok)
  })

  it("warm cache within TTL skips probe", async () => {
    const probe = vi.fn(async () => buildStatus("ok"))
    let time = 1000
    const cache = createHealthCache({ probe, now: () => time })

    await cache.get("gemini", "m1")
    expect(probe).toHaveBeenCalledTimes(1)

    time += 30_000 // 30s < 60s TTL for "ok"
    await cache.get("gemini", "m1")
    expect(probe).toHaveBeenCalledTimes(1) // still warm
  })

  it("expired cache entry triggers re-probe", async () => {
    const probe = vi.fn(async () => buildStatus("ok"))
    let time = 1000
    const cache = createHealthCache({ probe, now: () => time })

    await cache.get("gemini", "m1")
    time += TTL_BY_STATUS.ok + 1 // past TTL
    await cache.get("gemini", "m1")
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it("forceRefresh bypasses fresh cache", async () => {
    const probe = vi.fn(async () => buildStatus("ok"))
    const cache = createHealthCache({ probe, now: () => 1000 })

    await cache.get("gemini", "m1")
    await cache.get("gemini", "m1", { forceRefresh: true })
    expect(probe).toHaveBeenCalledTimes(2)
  })
})

describe("health-cache — TTL per status", () => {
  it.each([
    ["ok",             60_000] as const,
    ["rate_limited",   30_000] as const,
    ["down",           60_000] as const,
    ["quota_exceeded", 300_000] as const,
    ["auth_error",     600_000] as const,
  ])("status=%s → TTL %dms", async (status, expectedTtl) => {
    const probe = vi.fn(async () => buildStatus(status))
    const cache = createHealthCache({ probe, now: () => 5000 })
    await cache.get("p", "m")
    const entry = cache.peek("p", "m")
    expect(entry?.expiresAt).toBe(5000 + expectedTtl)
  })
})

describe("health-cache — in-flight dedup", () => {
  it("10 concurrent misses share a single probe call", async () => {
    let resolveProbe!: (s: HealthStatus) => void
    const probe = vi.fn(
      () =>
        new Promise<HealthStatus>((res) => {
          resolveProbe = res
        }),
    )
    const cache = createHealthCache({ probe, now: () => 1000 })

    const requests = Array.from({ length: 10 }, () => cache.get("gemini", "m1"))
    // All queued before probe resolves.
    expect(probe).toHaveBeenCalledTimes(1)
    resolveProbe(buildStatus("ok"))
    const results = await Promise.all(requests)
    expect(results.every((r) => r.status === "ok")).toBe(true)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it("in-flight promise clears after resolution → next miss hits probe again", async () => {
    let time = 1000
    const probe = vi.fn(async () => buildStatus("ok"))
    const cache = createHealthCache({ probe, now: () => time })

    await cache.get("gemini", "m1")
    time += TTL_BY_STATUS.ok + 1
    await cache.get("gemini", "m1")
    expect(probe).toHaveBeenCalledTimes(2)
  })
})

describe("health-cache — invalidate", () => {
  it("invalidate(providerId) drops only that provider's entries", async () => {
    const probe = vi.fn(async () => buildStatus("ok"))
    const cache = createHealthCache({ probe, now: () => 1000 })

    await cache.get("gemini", "m1")
    await cache.get("gemini", "m2")
    await cache.get("vertex", "m3")

    const removed = cache.invalidate("gemini")
    expect(removed).toBe(2)
    expect(cache.peek("gemini", "m1")).toBeNull()
    expect(cache.peek("gemini", "m2")).toBeNull()
    expect(cache.peek("vertex", "m3")).not.toBeNull()
  })

  it("invalidate() on empty / unknown provider returns 0", async () => {
    const probe = vi.fn(async () => buildStatus("ok"))
    const cache = createHealthCache({ probe, now: () => 1000 })
    expect(cache.invalidate("ghost")).toBe(0)
  })

  it("invalidateAll clears everything", async () => {
    const probe = vi.fn(async () => buildStatus("ok"))
    const cache = createHealthCache({ probe, now: () => 1000 })
    await cache.get("gemini", "m1")
    await cache.get("vertex", "m3")
    cache.invalidateAll()
    expect(cache.peek("gemini", "m1")).toBeNull()
    expect(cache.peek("vertex", "m3")).toBeNull()
  })

  it("after invalidate, next get re-probes", async () => {
    const probe = vi.fn(async () => buildStatus("ok"))
    const cache = createHealthCache({ probe, now: () => 1000 })
    await cache.get("gemini", "m1")
    cache.invalidate("gemini")
    await cache.get("gemini", "m1")
    expect(probe).toHaveBeenCalledTimes(2)
  })
})

describe("health-cache — prefix safety", () => {
  it("invalidate('mock') does not touch a provider whose id starts with 'mock' + suffix", async () => {
    // Defensive: invalidate matches "${id}:" (colon anchor), not bare prefix.
    const probe = vi.fn(async () => buildStatus("ok"))
    const cache = createHealthCache({ probe, now: () => 1000 })
    await cache.get("mock", "m")
    await cache.get("mock-fake", "m") // hypothetical sibling provider
    cache.invalidate("mock")
    expect(cache.peek("mock", "m")).toBeNull()
    expect(cache.peek("mock-fake", "m")).not.toBeNull()
  })
})
