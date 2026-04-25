// Session #39 Phase B1 — LLMProvider impl backed by xAI Grok.
//
// Composes config + retry + fetch into the LLMProvider seam used by every
// prompt-assist use case. Adding a new vendor (OpenAI, Anthropic) ships a
// parallel file (e.g. openai-provider.ts) plus a registry entry; no other
// module changes.

import { LLMUnavailableError } from "./errors"
import { readGrokConfig } from "./grok-config"
import { callGrokWithRetry } from "./grok-retry"
import type { LLMChatRequest, LLMChatResponse, LLMProvider } from "./types"

export function createGrokProvider(): LLMProvider {
  const config = readGrokConfig()
  if (!config) {
    throw new LLMUnavailableError(
      "XAI_API_KEY missing — cannot construct Grok provider",
      "grok",
      "missing-key",
    )
  }
  const frozenConfig = config

  async function chat(req: LLMChatRequest): Promise<LLMChatResponse> {
    const { response } = await callGrokWithRetry(frozenConfig, req)
    return response
  }

  return {
    name: "grok",
    model: frozenConfig.model,
    chat,
  }
}
