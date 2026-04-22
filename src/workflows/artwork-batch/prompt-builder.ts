// BOOTSTRAP-PHASE3 Step 3 — prompt composer for artwork-batch.
//
// Q4 decision: locale source is `params.language ?? "en"`. Language
// instruction line only appears when locale !== "en" (Gemini / Imagen
// default-assume English, so adding the line for en bloats the prompt
// with no signal).

import type { AppProfile } from "@/core/schemas/app-profile"
import type { LanguageCode } from "@/core/model-registry/types"
import type { Concept } from "@/core/dto/workflow-dto"

export interface BuildPromptParams {
  concept: Concept
  profile: AppProfile
  locale: LanguageCode
}

export function buildPrompt(params: BuildPromptParams): string {
  const { concept, profile, locale } = params
  const visual = profile.visual

  const parts: (string | null)[] = [
    `Style tone: ${visual.tone}`,
    `Subject: ${concept.description}`,
    `Create ${concept.title.toLowerCase()} artwork for ${profile.name} app.`,
    `Color palette: ${visual.primaryColor}, ${visual.secondaryColor}, accent ${visual.accentColor}`,
    visual.doList.length > 0 ? `Must include: ${visual.doList.join(", ")}` : null,
    visual.dontList.length > 0 ? `Avoid: ${visual.dontList.join(", ")}` : null,
    locale !== "en" ? `Output language for any embedded text: ${locale}` : null,
  ]

  return parts.filter((p): p is string => p !== null).join("\n")
}
