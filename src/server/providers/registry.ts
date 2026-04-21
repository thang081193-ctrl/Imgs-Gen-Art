// Provider registry — lookup by `providerId`. Throws typed error with structured
// context (available provider ids) so callers debugging bad IDs see options.
// Phase 1 registers only Mock; Gemini + Vertex join in Phase 2 Step 8/9.

import type { ImageProvider } from "@/core/providers/types"
import { ProviderNotFoundError } from "@/core/shared/errors"
import { mockProvider } from "./mock"

const registry: ReadonlyMap<string, ImageProvider> = new Map<string, ImageProvider>([
  [mockProvider.id, mockProvider],
])

export function getProvider(id: string): ImageProvider {
  const provider = registry.get(id)
  if (!provider) {
    throw new ProviderNotFoundError({
      providerId: id,
      availableProviders: Array.from(registry.keys()),
    })
  }
  return provider
}

export function listProviders(): ImageProvider[] {
  return Array.from(registry.values())
}

export function hasProvider(id: string): boolean {
  return registry.has(id)
}
