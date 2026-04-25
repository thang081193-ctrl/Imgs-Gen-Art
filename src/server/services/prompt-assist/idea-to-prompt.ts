// Session #39 Phase B1 — idea-to-prompt use case.
//
// Takes free-form `idea` + lane + optional platform/profileId, asks the
// active LLM to expand it into a generation prompt informed by AppProfile
// context (when profileId resolves). On any LLM error → composer fallback.

import {
  getActiveLLMProvider,
  LLMTimeoutError,
  LLMUnavailableError,
} from "@/server/services/llm"
import type { LLMProvider } from "@/server/services/llm"
import { tryLoadProfile } from "@/server/profile-repo"
import type { AppProfile } from "@/core/schemas/app-profile"
import { composeIdeaToPrompt } from "./fallback-composer"
import { logPromptAssist, type PromptAssistOutcome } from "./log"
import type { IdeaToPromptInput, PromptAssistResult } from "./types"

const SYSTEM_PROMPT =
  "You are an expert creative director writing generation prompts for an " +
  "image model. Output ONLY the prompt text — no preamble, no markdown. " +
  "Weave brand context into a coherent, generation-ready instruction."

function buildContextBlock(profile: AppProfile | null): string {
  if (!profile) return "(no app profile attached)"
  const dont = [...profile.visual.dontList, ...profile.context.forbiddenContent]
    .slice(0, 5)
    .join("; ") || "(none)"
  return [
    `App: ${profile.name} (${profile.category}). Tagline: ${profile.tagline}.`,
    `USP: ${profile.positioning.usp}. Persona: ${profile.positioning.targetPersona}.`,
    `Tone: ${profile.visual.tone}. Palette: ${profile.visual.primaryColor} / ${profile.visual.accentColor}.`,
    `Avoid: ${dont}.`,
  ].join(" ")
}

function buildUserPrompt(
  input: IdeaToPromptInput,
  profile: AppProfile | null,
): string {
  return [
    `Lane: ${input.lane}. Platform: ${input.platform ?? "any"}.`,
    `Brand context: ${buildContextBlock(profile)}`,
    `Idea / angle: ${input.idea}.`,
    "Compose a generation-ready prompt.",
  ].join("\n")
}

async function callProvider(
  provider: LLMProvider,
  input: IdeaToPromptInput,
  profile: AppProfile | null,
): Promise<PromptAssistResult> {
  const res = await provider.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input, profile) },
    ],
    maxTokens: 500,
    temperature: 0.5,
  })
  const result: PromptAssistResult = { prompt: res.text }
  if (res.tokens) result.tokens = res.tokens
  return result
}

export async function ideaToPrompt(
  input: IdeaToPromptInput,
): Promise<PromptAssistResult> {
  const start = Date.now()
  const provider = getActiveLLMProvider()
  const profile = input.profileId ? tryLoadProfile(input.profileId) : null

  const fallbackArgs = {
    idea: input.idea,
    lane: input.lane,
    ...(input.platform !== undefined ? { platform: input.platform } : {}),
    ...(input.profileId !== undefined ? { profileId: input.profileId } : {}),
  }

  if (!provider) {
    const result = composeIdeaToPrompt(fallbackArgs)
    logPromptAssist({
      ts: new Date().toISOString(),
      provider: "none",
      model: null,
      useCase: "idea-to-prompt",
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
      useCase: "idea-to-prompt",
      latencyMs: Date.now() - start,
      ...(result.tokens
        ? { inputTokens: result.tokens.in, outputTokens: result.tokens.out }
        : {}),
      outcome: "ok",
    })
    return result
  } catch (err) {
    const fallback = composeIdeaToPrompt(fallbackArgs)
    const outcome: PromptAssistOutcome = err instanceof LLMTimeoutError ? "timeout" : "fallback"
    logPromptAssist({
      ts: new Date().toISOString(),
      provider: provider.name,
      model: provider.model,
      useCase: "idea-to-prompt",
      latencyMs: Date.now() - start,
      outcome,
      error: err instanceof LLMUnavailableError || err instanceof LLMTimeoutError
        ? err.message
        : (err as Error).message,
    })
    return fallback
  }
}
