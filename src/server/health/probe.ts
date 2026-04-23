// Per-target health probe. Wraps `provider.health(modelId)` with:
//   - active-slot lookup (returns auth_error if no active slot exists)
//   - provider-not-registered guard (returns "down" with descriptive message)
//   - crash shielding (provider SDK exceptions → "down", never throws)
//
// This layer is what `createHealthCache` calls on miss. Keeping the logic
// separate from cache.ts lets us unit-test cache mechanics (TTL, dedup,
// invalidate) against a stubbed probe without pulling provider SDKs.

import type { HealthStatus } from "@/core/providers/types"
import { getProvider, hasProvider } from "@/server/providers"
import { loadStoredKeys } from "@/server/keys"
import type { ProviderId } from "@/server/keys"

function nowIso(): string {
  return new Date().toISOString()
}

function hasActiveSlot(providerId: string): boolean {
  // Mock has no slot requirement — always considered "active".
  if (providerId === "mock") return true
  if (providerId !== "gemini" && providerId !== "vertex") return false
  const store = loadStoredKeys()
  return store[providerId as ProviderId].activeSlotId !== null
}

export async function probeTarget(
  providerId: string,
  modelId: string,
): Promise<HealthStatus> {
  if (!hasProvider(providerId)) {
    return {
      status: "down",
      latencyMs: 0,
      message: `Provider '${providerId}' is not registered`,
      checkedAt: nowIso(),
    }
  }

  if (!hasActiveSlot(providerId)) {
    return {
      status: "auth_error",
      latencyMs: 0,
      message: `No active ${providerId} key. Add and activate a slot in Settings.`,
      checkedAt: nowIso(),
    }
  }

  const provider = getProvider(providerId)
  try {
    return await provider.health(modelId)
  } catch (err) {
    return {
      status: "down",
      latencyMs: 0,
      message: err instanceof Error ? `Probe crashed: ${err.message}` : "Probe crashed",
      checkedAt: nowIso(),
    }
  }
}
