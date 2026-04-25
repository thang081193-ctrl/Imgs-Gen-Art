// Session #39 Phase B1 — reverse-from-image use case.
//
// Vision call: caller passes raw image bytes; we sniff MIME + base64 + embed
// in an OpenAI-style content array. Active LLM provider invokes its vendor
// API; on error / no provider we fall back to the LLM-free reverse stub.

import {
  bufferToDataUrl,
  getActiveLLMProvider,
  LLMTimeoutError,
  LLMUnavailableError,
} from "@/server/services/llm"
import type { LLMProvider } from "@/server/services/llm"
import { composeReverseFromImageFallback } from "./fallback-reverse"
import { logPromptAssist, type PromptAssistOutcome } from "./log"
import type { PromptAssistResult, ReverseFromImageInput } from "./types"

const SYSTEM_PROMPT =
  "You are an expert creative director. Given an image, produce a concise but " +
  "thorough generation prompt that captures subject, style, mood, lighting, " +
  "composition, and palette so the image can be re-created from scratch."

function buildUserPrompt(input: ReverseFromImageInput): string {
  const parts: string[] = ["Reverse-engineer a generation prompt for this image."]
  if (input.lane) parts.push(`Target lane: ${input.lane}.`)
  if (input.platform) parts.push(`Platform: ${input.platform}.`)
  parts.push("Return only the prompt text — no preamble, no markdown.")
  return parts.join(" ")
}

async function callProvider(
  provider: LLMProvider,
  input: ReverseFromImageInput,
): Promise<PromptAssistResult> {
  const dataUrl = bufferToDataUrl(input.image)
  const res = await provider.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: buildUserPrompt(input) },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    maxTokens: 500,
    temperature: 0.4,
  })
  const result: PromptAssistResult = { prompt: res.text }
  if (res.tokens) result.tokens = res.tokens
  return result
}

export async function reverseFromImage(
  input: ReverseFromImageInput,
): Promise<PromptAssistResult> {
  const start = Date.now()
  const provider = getActiveLLMProvider()
  if (!provider) {
    const result = composeReverseFromImageFallback(input)
    logPromptAssist({
      ts: new Date().toISOString(),
      provider: "none",
      model: null,
      useCase: "reverse-from-image",
      latencyMs: Date.now() - start,
      outcome: "fallback",
    })
    return result
  }

  try {
    const result = await callProvider(provider, input)
    logPromptAssist({
      ts: new Date().toISOString(),
      provider: provider.name,
      model: provider.model,
      useCase: "reverse-from-image",
      latencyMs: Date.now() - start,
      ...(result.tokens
        ? { inputTokens: result.tokens.in, outputTokens: result.tokens.out }
        : {}),
      outcome: "ok",
    })
    return result
  } catch (err) {
    const fallback = composeReverseFromImageFallback(input)
    const outcome: PromptAssistOutcome = err instanceof LLMTimeoutError ? "timeout" : "fallback"
    logPromptAssist({
      ts: new Date().toISOString(),
      provider: provider.name,
      model: provider.model,
      useCase: "reverse-from-image",
      latencyMs: Date.now() - start,
      outcome,
      error: err instanceof LLMUnavailableError || err instanceof LLMTimeoutError
        ? err.message
        : (err as Error).message,
    })
    return fallback
  }
}
