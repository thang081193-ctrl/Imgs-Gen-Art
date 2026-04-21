// GET /api/providers — returns full static catalog (providers + models +
// capabilities) plus runtime registry state (which providers are wired).
// Phase 1 registers only mock; gemini/vertex join in Phase 4.

import { Hono } from "hono"
import { ALL_MODELS, ALL_PROVIDERS } from "@/core/model-registry"
import type { ModelInfo, ProviderInfo } from "@/core/model-registry/types"
import { listProviders } from "@/server/providers"

export interface ProvidersBody {
  providers: ProviderInfo[]
  models: ModelInfo[]
  registeredProviderIds: string[]
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
  return route
}
