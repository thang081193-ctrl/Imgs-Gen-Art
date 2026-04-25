// Session #39 Phase B1 — active LLM provider resolver.
//
// Reads PROMPT_LLM_PROVIDER (default "grok") and instantiates the matching
// provider. Returns null when the active provider can't be constructed
// (missing key, unknown name) — use cases interpret null as "fall back".
// Never throws; the caller decides degrade vs. error.
//
// Adding OpenAI / Anthropic = ship `<vendor>-provider.ts` + add a case here.

import { LLMUnavailableError } from "./errors"
import { createGrokProvider } from "./grok-provider"
import type { LLMProvider } from "./types"

export type LLMProviderName = "grok"
const KNOWN_PROVIDERS: readonly LLMProviderName[] = ["grok"]

export function activeProviderName(): LLMProviderName {
  const raw = process.env["PROMPT_LLM_PROVIDER"]?.trim().toLowerCase()
  if (!raw) return "grok"
  if ((KNOWN_PROVIDERS as readonly string[]).includes(raw)) {
    return raw as LLMProviderName
  }
  return "grok"
}

export function getActiveLLMProvider(): LLMProvider | null {
  const name = activeProviderName()
  try {
    switch (name) {
      case "grok":
        return createGrokProvider()
    }
  } catch (err) {
    if (err instanceof LLMUnavailableError) return null
    throw err
  }
}
