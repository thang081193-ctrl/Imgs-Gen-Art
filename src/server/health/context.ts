// Health-cache singleton — mirrors asset-store/context.ts pattern.
// Boot calls initHealthCache(); routes read via getHealthCache(); tests
// reset via _resetHealthCacheForTests to get a fresh instance.

import { createHealthCache, type HealthCache, type HealthProbeFn } from "./cache"
import { probeTarget } from "./probe"

let _cache: HealthCache | null = null

export interface InitHealthCacheOptions {
  /** Override probe for tests (defaults to production probeTarget). */
  probe?: HealthProbeFn
  now?: () => number
}

export function initHealthCache(options: InitHealthCacheOptions = {}): HealthCache {
  if (_cache) {
    throw new Error("initHealthCache: already initialized — call _resetHealthCacheForTests first")
  }
  _cache = createHealthCache({
    probe: options.probe ?? probeTarget,
    ...(options.now ? { now: options.now } : {}),
  })
  return _cache
}

export function getHealthCache(): HealthCache {
  if (!_cache) {
    throw new Error("health-cache not initialized — call initHealthCache() at boot")
  }
  return _cache
}

export function _resetHealthCacheForTests(): void {
  _cache = null
}
