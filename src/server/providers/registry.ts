// Provider registry — lookup by `providerId`. Throws typed error with structured
// context (available provider ids) so callers debugging bad IDs see options.
// Phase 4: all three real-ish providers registered — Mock + Gemini (Session
// #18) + Vertex Imagen (Session #19).

import type { ImageProvider } from "@/core/providers/types"
import { ProviderNotFoundError } from "@/core/shared/errors"
import { geminiProvider } from "./gemini"
import { mockProvider } from "./mock"
import { vertexImagenProvider } from "./vertex-imagen"

const registry: ReadonlyMap<string, ImageProvider> = new Map<string, ImageProvider>([
  [mockProvider.id, mockProvider],
  [geminiProvider.id, geminiProvider],
  [vertexImagenProvider.id, vertexImagenProvider],
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
