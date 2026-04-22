// Session #15 — aso-screenshots prompt builder.
//
// Each asset is rendered for one (concept, targetLang, variantIndex) triple.
// The copy-template lookup drives the headline + subheadline overlays in
// the chosen language; the layout config drives the phone-UI framing.

import type { AppProfile } from "@/core/schemas/app-profile"
import type { LanguageCode } from "@/core/model-registry/types"
import type { AdLayoutsFile, CopyLang, CopyTemplatesFile } from "@/core/templates"

import type { AsoConcept } from "./types"

export interface BuildAsoPromptParams {
  concept: AsoConcept
  profile: AppProfile
  locale: LanguageCode
  targetLang: CopyLang
  variantIndex: number
  layouts: AdLayoutsFile
  copyTemplates: CopyTemplatesFile
}

export function buildAsoPrompt(params: BuildAsoPromptParams): string {
  const { concept, profile, locale, targetLang, variantIndex, layouts, copyTemplates } = params
  const layout = layouts.layouts[concept.layoutId]
  if (!layout) {
    throw new Error(`aso-screenshots: unknown layoutId '${concept.layoutId}'`)
  }
  const copy = copyTemplates.templates[targetLang]
  if (!copy) {
    throw new Error(`aso-screenshots: no copy-template rows for lang '${targetLang}'`)
  }
  const slot = variantIndex % copy.h.length
  const headline = copy.h[slot]!
  const subhead = copy.s[slot]!

  const visual = profile.visual
  const parts: (string | null)[] = [
    `App store screenshot for ${profile.name} (device-framed).`,
    `Layout concept: ${layout.description}`,
    `After-state to render inside the phone frame: ${layout.afterStyle}`,
    `Headline (${targetLang}): "${headline}"`,
    `Subheadline (${targetLang}): "${subhead}"`,
    `Style tone: ${visual.tone}. Palette: ${visual.primaryColor}, ${visual.secondaryColor}, accent ${visual.accentColor}.`,
    visual.doList.length > 0 ? `Must include: ${visual.doList.join(", ")}` : null,
    visual.dontList.length > 0 ? `Avoid: ${visual.dontList.join(", ")}` : null,
    locale !== "en" && locale !== targetLang
      ? `Interface chrome / non-copy text language: ${locale}`
      : null,
  ]

  return parts.filter((p): p is string => p !== null).join("\n")
}
