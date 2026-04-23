// /api/providers — static catalog + compatibility matrix + live health.
//
// GET /              — providers + models + runtime registry state.
// GET /compatibility — precomputed `resolveCompatibility(ALL_WORKFLOWS, ALL_MODELS)`
//                      keyed by `workflowId → "{providerId}:{modelId}" → result`.
// GET /health        — Phase 4 Step 4 (Session #21): real provider.health()
//                      calls behind an in-memory cache. TTL varies by status
//                      (see src/server/health/cache.ts). Slot activate/delete
//                      fires invalidate(providerId) from keys.ts.
//
// Session #13 Q4 + Session #21 Q3 — query shape:
//   (none)                → { [providerId]: { [modelId]: HealthStatus } }
//   ?provider=X           → { [X]: { [modelId]: HealthStatus } }
//   ?provider=X&model=Y   → HealthStatus (flat)
//   ?model=Y alone        → 400 MODEL_REQUIRES_PROVIDER
//   ?forceRefresh=true    → bypass cache for this request (UI "Retry" button)
// Mock is included in the matrix for uniformity (Q7).

import { Hono } from "hono"
import { ALL_MODELS, ALL_PROVIDERS } from "@/core/model-registry"
import type { ModelInfo, ProviderInfo } from "@/core/model-registry/types"
import type { HealthStatus } from "@/core/providers/types"
import { resolveCompatibility } from "@/core/compatibility"
import { getHealthCache } from "@/server/health"
import { listProviders } from "@/server/providers"
import { ALL_WORKFLOWS } from "@/workflows"

export interface ProvidersBody {
  providers: ProviderInfo[]
  models: ModelInfo[]
  registeredProviderIds: string[]
}

function buildCompatibilityMatrix() {
  return resolveCompatibility({
    workflows: ALL_WORKFLOWS.map((w) => ({
      id: w.id,
      requirement: w.requirement,
      compatibilityOverrides: [...w.compatibilityOverrides],
    })),
    models: ALL_MODELS,
  })
}

interface HealthTarget { providerId: string; modelId: string }

function enumerateTargets(filter: { providerId?: string }): HealthTarget[] {
  const source = filter.providerId
    ? ALL_MODELS.filter((m) => m.providerId === filter.providerId)
    : ALL_MODELS
  return source.map((m) => ({ providerId: m.providerId, modelId: m.id }))
}

export function createProvidersRoute(): Hono {
  const route = new Hono()

  route.get("/", (c) => {
    const body: ProvidersBody = {
      providers: [...ALL_PROVIDERS],
      models: [...ALL_MODELS],
      registeredProviderIds: listProviders().map((p) => p.id),
    }
    return c.json(body)
  })

  route.get("/compatibility", (c) => {
    return c.json({ matrix: buildCompatibilityMatrix() })
  })

  route.get("/health", async (c) => {
    const providerId = c.req.query("provider")
    const modelId = c.req.query("model")
    const forceRefresh = c.req.query("forceRefresh") === "true"
    const cache = getHealthCache()

    if (modelId && !providerId) {
      return c.json(
        {
          error: "MODEL_REQUIRES_PROVIDER",
          message:
            "Query ?model= requires ?provider= (model IDs are not globally unique across providers)",
        },
        400,
      )
    }

    if (providerId && modelId) {
      const match = ALL_MODELS.find(
        (m) => m.providerId === providerId && m.id === modelId,
      )
      if (!match) {
        return c.json({ error: "MODEL_NOT_FOUND", providerId, modelId }, 404)
      }
      const status = await cache.get(providerId, modelId, { forceRefresh })
      return c.json(status)
    }

    const targets = enumerateTargets({ ...(providerId ? { providerId } : {}) })
    if (providerId && targets.length === 0) {
      return c.json({ error: "PROVIDER_NOT_FOUND", providerId }, 404)
    }

    const settled = await Promise.allSettled(
      targets.map((t) => cache.get(t.providerId, t.modelId, { forceRefresh })),
    )

    const byProvider: Record<string, Record<string, HealthStatus>> = {}
    settled.forEach((result, i) => {
      const target = targets[i] as HealthTarget
      byProvider[target.providerId] ??= {}
      const bucket = byProvider[target.providerId] as Record<string, HealthStatus>
      if (result.status === "fulfilled") {
        bucket[target.modelId] = result.value
      } else {
        // Probe rejected defensively (cache.get shouldn't throw but guard anyway).
        const reason = result.reason
        bucket[target.modelId] = {
          status: "down",
          latencyMs: 0,
          message:
            reason instanceof Error ? `Probe crashed: ${reason.message}` : "Probe crashed",
          checkedAt: new Date().toISOString(),
        }
      }
    })
    return c.json(byProvider)
  })

  return route
}
