// Session #15 — ad-production prompt builder.
//
// Composes a single prompt from:
//   - profile identity (name + tone + palette)
//   - layout config (before/after visual styles)
//   - copy template row (headlines + subheadlines, picked by variant index)
//
// Variant index selects which (h, s) triple to bind from the CopyEntry's
// fixed-length arrays so the 3 variants-per-concept surface different
// headlines without re-seeding the random draw.

import type { AppProfile } from "@/core/schemas/app-profile"
import type { LanguageCode } from "@/core/model-registry/types"
import type { AdLayoutsFile, CopyTemplatesFile, CopyLang } from "@/core/templates"

import type { AdConcept } from "./types"

export interface BuildAdPromptParams {
  concept: AdConcept
  profile: AppProfile
  locale: LanguageCode
  variantIndex: number
  layouts: AdLayoutsFile
  copyTemplates: CopyTemplatesFile
}

/** Pick 1 of 3 headline/subheadline entries for this variant.
 *  Copy-entries always have length 3 (schema-enforced); variantIndex is
 *  caller-bounded to [0, variantsPerConcept) which we enforce to ≤ 4,
 *  so we modulo-wrap to stay within [0, 3). */
function pickCopy(
  copy: CopyTemplatesFile,
  copyKey: string,
  variantIndex: number,
): { h: string; s: string } {
  const entry = copy.templates[copyKey as CopyLang]
  if (!entry) {
    throw new Error(`ad-production: unknown copyKey '${copyKey}' in copy-templates`)
  }
  const i = variantIndex % entry.h.length
  return { h: entry.h[i]!, s: entry.s[i]! }
}

export function buildAdPrompt(params: BuildAdPromptParams): string {
  const { concept, profile, locale, variantIndex, layouts, copyTemplates } = params
  const layout = layouts.layouts[concept.layoutId]
  if (!layout) {
    throw new Error(`ad-production: unknown layoutId '${concept.layoutId}'`)
  }
  const { h, s } = pickCopy(copyTemplates, concept.copyKey, variantIndex)

  const visual = profile.visual
  const parts: (string | null)[] = [
    `App ad visualization for ${profile.name} (${layout.type}).`,
    `Feature focus: ${concept.featureFocus.replace(/_/g, " ")}.`,
    `Before: ${layout.beforeStyle}`,
    `After: ${layout.afterStyle}`,
    `Headline overlay (language=${concept.copyKey}): "${h}"`,
    `Subheadline overlay: "${s}"`,
    `Style tone: ${visual.tone}. Palette: ${visual.primaryColor}, ${visual.secondaryColor}, accent ${visual.accentColor}.`,
    layout.hasPhoneUI ? "Include a realistic phone-UI chrome around the after state." : null,
    visual.doList.length > 0 ? `Must include: ${visual.doList.join(", ")}` : null,
    visual.dontList.length > 0 ? `Avoid: ${visual.dontList.join(", ")}` : null,
    locale !== "en" ? `Output language for any additional embedded text: ${locale}` : null,
  ]

  return parts.filter((p): p is string => p !== null).join("\n")
}
