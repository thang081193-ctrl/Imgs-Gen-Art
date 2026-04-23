// Phase 4 Step 4 — /providers/health caching layer.
//
// Stores most-recent HealthStatus per (providerId, modelId) with a TTL that
// varies by status (Session #21 Q1):
//   ok              60s    — normal recheck
//   rate_limited    30s    — check sooner since 429 can clear fast
//   down            60s    — transient backend issues
//   quota_exceeded  5min   — daily quotas reset slowly, don't hammer
//   auth_error      10min  — requires user action (rotate key), don't spam
//
// In-flight dedup (Q4): concurrent cache-miss requests for the same key
// share a single probe Promise — 10 simultaneous /health hits = 1 SDK call.
//
// Invalidation (Q2): `invalidate(providerId)` drops all entries for that
// provider; keys.ts route fires it after saveStoredKeys(activateSlot / removeSlot).
// Slot-manager itself stays pure — it does not import the cache.

import type { HealthStatus, HealthStatusCode } from "@/core/providers/types"

export interface HealthCacheEntry {
  status: HealthStatus
  expiresAt: number
  probedAt: number
}

export type HealthProbeFn = (
  providerId: string,
  modelId: string,
) => Promise<HealthStatus>

export const TTL_BY_STATUS: Readonly<Record<HealthStatusCode, number>> = {
  ok:              60_000,
  rate_limited:    30_000,
  down:            60_000,
  quota_exceeded:  300_000,
  auth_error:      600_000,
}

function cacheKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`
}

export interface HealthCache {
  get: (providerId: string, modelId: string, opts?: { forceRefresh?: boolean }) => Promise<HealthStatus>
  peek: (providerId: string, modelId: string) => HealthCacheEntry | null
  invalidate: (providerId: string) => number
  invalidateAll: () => void
}

export interface CreateHealthCacheDeps {
  probe: HealthProbeFn
  /** Override for tests; defaults to Date.now. */
  now?: () => number
}

export function createHealthCache(deps: CreateHealthCacheDeps): HealthCache {
  const cache = new Map<string, HealthCacheEntry>()
  const inFlight = new Map<string, Promise<HealthStatus>>()
  const now = deps.now ?? Date.now

  async function get(
    providerId: string,
    modelId: string,
    opts: { forceRefresh?: boolean } = {},
  ): Promise<HealthStatus> {
    const key = cacheKey(providerId, modelId)

    if (!opts.forceRefresh) {
      const cached = cache.get(key)
      if (cached && cached.expiresAt > now()) {
        return cached.status
      }
    }

    const existing = inFlight.get(key)
    if (existing) return existing

    const probePromise = (async () => {
      const status = await deps.probe(providerId, modelId)
      const probedAt = now()
      const ttl = TTL_BY_STATUS[status.status]
      cache.set(key, { status, expiresAt: probedAt + ttl, probedAt })
      return status
    })().finally(() => {
      inFlight.delete(key)
    })

    inFlight.set(key, probePromise)
    return probePromise
  }

  function peek(providerId: string, modelId: string): HealthCacheEntry | null {
    return cache.get(cacheKey(providerId, modelId)) ?? null
  }

  function invalidate(providerId: string): number {
    let removed = 0
    const prefix = `${providerId}:`
    for (const k of cache.keys()) {
      if (k.startsWith(prefix)) {
        cache.delete(k)
        removed++
      }
    }
    return removed
  }

  function invalidateAll(): void {
    cache.clear()
  }

  return { get, peek, invalidate, invalidateAll }
}
