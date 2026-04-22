// /api/providers — static catalog + compatibility matrix + stubbed health.
//
// GET /              — providers + models + runtime registry state.
// GET /compatibility — precomputed `resolveCompatibility(ALL_WORKFLOWS, ALL_MODELS)`
//                      keyed by `workflowId → "{providerId}:{modelId}" → result`.
// GET /health        — Phase 3 stubs every (provider, model) as "unknown";
//                      Phase 4 swaps in real `provider.health()` calls.
//
// Session #13 Q4 — /health query shape:
//   (none)                → { [providerId]: { [modelId]: HealthStatus } }
//   ?provider=X           → { [X]: { [modelId]: HealthStatus } }
//   ?provider=X&model=Y   → HealthStatus (flat)
//   ?model=Y alone        → 400 MODEL_REQUIRES_PROVIDER
// The last case rejects because model IDs are not globally unique across
// providers — requiring both clarifies intent and keeps the contract
// monotonic when Phase 4 real health lands.

import { Hono } from "hono"
import { ALL_MODELS, ALL_PROVIDERS } from "@/core/model-registry"
import type { ModelInfo, ProviderInfo } from "@/core/model-registry/types"
import type { HealthStatus } from "@/core/providers/types"
import { resolveCompatibility } from "@/core/compatibility"
import { listProviders } from "@/server/providers"
import { ALL_WORKFLOWS } from "@/workflows"

export interface ProvidersBody {
  providers: ProviderInfo[]
  models: ModelInfo[]
  registeredProviderIds: string[]
}

function stubHealth(): HealthStatus {
  return {
    status: "ok",
    latencyMs: 0,
    message: "stub — real health check arrives in Phase 4",
    checkedAt: new Date().toISOString(),
  }
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

  route.get("/health", (c) => {
    const providerId = c.req.query("provider")
    const modelId = c.req.query("model")

    if (modelId && !providerId) {
      return c.json(
        {
          error: "MODEL_REQUIRES_PROVIDER",
          message: "Query ?model= requires ?provider= (model IDs are not globally unique across providers)",
        },
        400,
      )
    }

    if (providerId && modelId) {
      const match = ALL_MODELS.find((m) => m.providerId === providerId && m.id === modelId)
      if (!match) {
        return c.json({ error: "MODEL_NOT_FOUND", providerId, modelId }, 404)
      }
      return c.json(stubHealth())
    }

    const filtered = providerId
      ? ALL_MODELS.filter((m) => m.providerId === providerId)
      : ALL_MODELS
    if (providerId && filtered.length === 0) {
      return c.json({ error: "PROVIDER_NOT_FOUND", providerId }, 404)
    }
    const byProvider: Record<string, Record<string, HealthStatus>> = {}
    for (const m of filtered) {
      byProvider[m.providerId] ??= {}
      // biome safety: bracket assignment above guarantees init.
      const bucket = byProvider[m.providerId] as Record<string, HealthStatus>
      bucket[m.id] = stubHealth()
    }
    return c.json(byProvider)
  })

  return route
}
