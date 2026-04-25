// Session #39 Phase B1 — single Grok HTTP call.
//
// Q-39.B: native fetch + AbortController, no SDK. xAI exposes an OpenAI-compat
// /v1/chat/completions endpoint; this module owns ONE responsibility — make
// the call, parse the response, classify HTTP status. Retry/timeout policy
// lives in grok-retry.ts; provider composition in grok-provider.ts.
//
// Vision input: caller embeds `data:image/...;base64,...` URLs inside the
// message content array (per LLMImagePart shape). xAI accepts the OpenAI
// vision shape verbatim.

import type { LLMChatRequest, LLMChatResponse } from "./types"
import { LLMTimeoutError, LLMUnavailableError } from "./errors"
import type { GrokConfig } from "./grok-config"

interface GrokChoice {
  message?: { content?: string }
}

interface GrokUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

interface GrokResponseBody {
  choices?: GrokChoice[]
  usage?: GrokUsage
}

export interface GrokCallOutcome {
  response: LLMChatResponse
  httpStatus: number
}

export async function callGrokOnce(
  config: GrokConfig,
  req: LLMChatRequest,
): Promise<GrokCallOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  if (req.signal) {
    req.signal.addEventListener("abort", () => controller.abort(), { once: true })
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages: req.messages,
  }
  if (req.maxTokens !== undefined) body["max_tokens"] = req.maxTokens
  if (req.temperature !== undefined) body["temperature"] = req.temperature

  let res: Response
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    if (controller.signal.aborted && !req.signal?.aborted) {
      throw new LLMTimeoutError("grok", config.timeoutMs)
    }
    throw new LLMUnavailableError(
      `Grok fetch failed: ${(err as Error).message}`,
      "grok",
      "http-error",
    )
  }
  clearTimeout(timeout)

  if (!res.ok) {
    throw new LLMUnavailableError(
      `Grok HTTP ${res.status}`,
      "grok",
      "http-error",
      res.status,
    )
  }

  const json = (await res.json()) as GrokResponseBody
  const text = json.choices?.[0]?.message?.content ?? ""
  const response: LLMChatResponse = { text }
  if (json.usage?.prompt_tokens !== undefined && json.usage.completion_tokens !== undefined) {
    response.tokens = { in: json.usage.prompt_tokens, out: json.usage.completion_tokens }
  }
  return { response, httpStatus: res.status }
}
