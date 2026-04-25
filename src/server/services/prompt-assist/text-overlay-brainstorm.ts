// Session #39 Phase B1 — text-overlay-brainstorm use case.
//
// Asks the LLM for 5 short headline / overlay candidates (varied tones)
// given an optional reference image / description / draft headline. Falls
// back to the 5-template composer when LLM is offline.

import {
  bufferToDataUrl,
  getActiveLLMProvider,
  LLMTimeoutError,
  LLMUnavailableError,
} from "@/server/services/llm"
import type { LLMContentPart, LLMProvider } from "@/server/services/llm"
import { tryLoadProfile } from "@/server/profile-repo"
import type { AppProfile } from "@/core/schemas/app-profile"
import { composeTextOverlayBrainstorm } from "./fallback-overlay"
import { logPromptAssist, type PromptAssistOutcome } from "./log"
import type { PromptAssistResult, TextOverlayBrainstormInput } from "./types"

const SYSTEM_PROMPT =
  "You write punchy text overlays for ads / app screenshots. Return EXACTLY " +
  "5 lines, each prefixed with a tone label in square brackets — one each " +
  "of: [bold], [playful], [minimal], [urgency], [social-proof]. Each line " +
  "≤ 12 words. No preamble, no markdown."

function buildUserContent(
  input: TextOverlayBrainstormInput,
  profile: AppProfile | null,
): string | LLMContentPart[] {
  const lines: string[] = []
  if (profile) {
    lines.push(`App: ${profile.name}. USP: ${profile.positioning.usp}. Tone: ${profile.visual.tone}.`)
  }
  if (input.description) lines.push(`Visual / context: ${input.description}.`)
  if (input.headline) lines.push(`Draft headline to riff on: "${input.headline}".`)
  if (lines.length === 0) lines.push("Generate 5 generic SaaS overlay options.")

  if (!input.image) return lines.join("\n")
  return [
    { type: "text", text: lines.join("\n") },
    { type: "image_url", image_url: { url: bufferToDataUrl(input.image) } },
  ]
}

async function callProvider(
  provider: LLMProvider,
  input: TextOverlayBrainstormInput,
  profile: AppProfile | null,
): Promise<PromptAssistResult> {
  const res = await provider.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserContent(input, profile) },
    ],
    maxTokens: 300,
    temperature: 0.7,
  })
  const result: PromptAssistResult = { prompt: res.text }
  if (res.tokens) result.tokens = res.tokens
  return result
}

export async function textOverlayBrainstorm(
  input: TextOverlayBrainstormInput,
): Promise<PromptAssistResult> {
  const start = Date.now()
  const provider = getActiveLLMProvider()
  const profile = input.profileId ? tryLoadProfile(input.profileId) : null

  const fallbackArgs = {
    ...(input.headline !== undefined ? { headline: input.headline } : {}),
    ...(input.profileId !== undefined ? { profileId: input.profileId } : {}),
  }

  if (!provider) {
    const result = composeTextOverlayBrainstorm(fallbackArgs)
    logPromptAssist({
      ts: new Date().toISOString(),
      provider: "none",
      model: null,
      useCase: "text-overlay-brainstorm",
      latencyMs: Date.now() - start,
      outcome: "fallback",
    })
    return result
  }

  try {
    const result = await callProvider(provider, input, profile)
    logPromptAssist({
      ts: new Date().toISOString(),
      provider: provider.name,
      model: provider.model,
      useCase: "text-overlay-brainstorm",
      latencyMs: Date.now() - start,
      ...(result.tokens
        ? { inputTokens: result.tokens.in, outputTokens: result.tokens.out }
        : {}),
      outcome: "ok",
    })
    return result
  } catch (err) {
    const fallback = composeTextOverlayBrainstorm(fallbackArgs)
    const outcome: PromptAssistOutcome = err instanceof LLMTimeoutError ? "timeout" : "fallback"
    logPromptAssist({
      ts: new Date().toISOString(),
      provider: provider.name,
      model: provider.model,
      useCase: "text-overlay-brainstorm",
      latencyMs: Date.now() - start,
      outcome,
      error: err instanceof LLMUnavailableError || err instanceof LLMTimeoutError
        ? err.message
        : (err as Error).message,
    })
    return fallback
  }
}
