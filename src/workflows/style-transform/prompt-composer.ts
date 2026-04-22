// Session #15 — style-transform prompt builder.
//
// Composes a prompt describing the style-transfer intent. The Mock provider
// ignores source bytes entirely (Q2); real Phase 4 Gemini-NB2 reads the
// source file separately via GenerateParams extension (not yet wired). The
// prompt is still a standalone string so both paths compose symmetrically.

import type { AppProfile } from "@/core/schemas/app-profile"
import type { LanguageCode } from "@/core/model-registry/types"
import type { StyleDnaFile } from "@/core/templates"

import type { StyleConcept } from "./types"

export interface BuildStylePromptParams {
  concept: StyleConcept
  profile: AppProfile
  locale: LanguageCode
  variantIndex: number
  styles: StyleDnaFile
}

export function buildStylePrompt(params: BuildStylePromptParams): string {
  const { concept, profile, locale, variantIndex, styles } = params
  const style = styles.styles[concept.styleDnaKey]
  if (!style) {
    throw new Error(`style-transform: unknown styleDnaKey '${concept.styleDnaKey}'`)
  }

  const visual = profile.visual
  const parts: (string | null)[] = [
    `Transform the provided source image into the ${style.label} style (interpretation #${concept.serial}).`,
    `Style cues: ${style.promptCues}`,
    `Render style: ${style.renderStyle}`,
    `Palette guidance: ${visual.primaryColor}, ${visual.secondaryColor}, accent ${visual.accentColor}`,
    visual.doList.length > 0 ? `Must preserve: ${visual.doList.join(", ")}` : null,
    visual.dontList.length > 0 ? `Avoid: ${visual.dontList.join(", ")}` : null,
    variantIndex > 0 ? `Variant angle #${variantIndex + 1} — vary composition/lighting slightly from base.` : null,
    locale !== "en" ? `Output language for any embedded text: ${locale}` : null,
  ]

  return parts.filter((p): p is string => p !== null).join("\n")
}
