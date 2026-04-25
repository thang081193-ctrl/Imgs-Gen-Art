// Phase E (Session #44) — google-ads prompt composer.
//
// Composes the LLM prompt that asks for `{headlineCount}` headlines +
// `{descriptionCount}` descriptions for the requested featureFocus,
// scoped by the app profile's positioning + visual tone. Output
// contract is JSON so the runner can parse without regex roulette.

import type { AppProfile } from "@/core/schemas/app-profile"
import type { FeatureFocus } from "@/core/templates"

export interface BuildGoogleAdsPromptParams {
  profile: AppProfile
  featureFocus: FeatureFocus
  headlineCount: number
  descriptionCount: number
}

/** Returns the full prompt to hand to the LLM provider. The LLM is
 *  expected to respond with strict JSON of shape
 *  `{ headlines: string[]; descriptions: string[] }`. The runner
 *  parses + falls back to a deterministic synth if parsing fails. */
export function buildGoogleAdsPrompt(
  params: BuildGoogleAdsPromptParams,
): string {
  const { profile, featureFocus, headlineCount, descriptionCount } = params
  const lines = [
    `You are writing Google Responsive Search Ads for the app "${profile.name}".`,
    `Tagline: ${profile.tagline}.`,
    `Target persona: ${profile.positioning.targetPersona}.`,
    `USP: ${profile.positioning.usp}.`,
    `Feature focus: ${featureFocus.replace(/_/g, " ")}.`,
    `Tone: ${profile.visual.tone}.`,
    profile.visual.doList.length > 0
      ? `Must include themes: ${profile.visual.doList.join(", ")}.`
      : null,
    profile.visual.dontList.length > 0
      ? `Avoid themes: ${profile.visual.dontList.join(", ")}.`
      : null,
    "",
    `Write ${headlineCount} headlines (each ≤30 chars) and ${descriptionCount} descriptions (each ≤90 chars).`,
    "Return strict JSON only, with no preamble: {\"headlines\": string[], \"descriptions\": string[]}.",
  ]
  return lines.filter((l): l is string => l !== null).join("\n")
}

export interface ParsedGoogleAdsResponse {
  headlines: string[]
  descriptions: string[]
}

/** Parses an LLM response. Tolerates leading/trailing prose by
 *  scanning for the first {...} JSON block. Throws on malformed
 *  payloads so the runner can catch and fall back. */
export function parseGoogleAdsResponse(
  raw: string,
): ParsedGoogleAdsResponse {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) {
    throw new Error("google-ads: LLM response missing JSON object")
  }
  const slice = raw.slice(start, end + 1)
  const parsed: unknown = JSON.parse(slice)
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)["headlines"]) ||
    !Array.isArray((parsed as Record<string, unknown>)["descriptions"])
  ) {
    throw new Error("google-ads: LLM JSON missing headlines/descriptions arrays")
  }
  const obj = parsed as { headlines: unknown[]; descriptions: unknown[] }
  return {
    headlines: obj.headlines.map((h) => String(h)),
    descriptions: obj.descriptions.map((d) => String(d)),
  }
}

/** Deterministic fallback when no LLM is configured. Keeps the
 *  workflow runnable in dev/test without burning a real API call. */
export function synthesizeGoogleAdsResponse(
  params: BuildGoogleAdsPromptParams,
): ParsedGoogleAdsResponse {
  const { profile, featureFocus, headlineCount, descriptionCount } = params
  const focus = featureFocus.replace(/_/g, " ")
  const headlines: string[] = []
  for (let i = 0; i < headlineCount; i++) {
    headlines.push(`${profile.name} — ${focus} headline ${i + 1}`)
  }
  const descriptions: string[] = []
  for (let i = 0; i < descriptionCount; i++) {
    descriptions.push(
      `${profile.tagline} · ${focus} pitch ${i + 1} for ${profile.positioning.targetPersona}.`,
    )
  }
  return { headlines, descriptions }
}
