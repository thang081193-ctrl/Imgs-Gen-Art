// Session #15 Q1 — ad-production concept selection.
//
// Algorithm (per Q1): cartesian product of (layouts_for_feature × copyKeys),
// mulberry32-seeded shuffle, pick top `conceptCount`. Each picked pair
// becomes one AdConcept with a unique per-concept seed derived via
// `deriveSeed(batchSeed, "${layoutId}:${copyKey}")`.
//
// Output is deterministic for a fixed (featureFocus, batchSeed).
//
// Session #35 F2 (language-drift fix): the cartesian product is now
// locked to a single copyKey (= the form's top-level language, narrowed
// to CopyLang with "en" fallback). Previously all 10 copyKeys entered
// the shuffle and the prompt-composer baked `concept.copyKey` into the
// prompt's `language=` directive, so batches with form `language=en`
// still rendered pt/th/vi headlines whenever the shuffle picked those
// keys — visible as "font chữ sai" in dogfood. Locking at generator
// time keeps the single-column cartesian deterministic and makes the
// form input authoritative.

import type { AdLayoutsFile, CopyTemplatesFile, CopyLang, FeatureFocus } from "@/core/templates"
import { shortId } from "@/core/shared/id"
import { deriveSeed, mulberry32 } from "@/core/shared/rand"

import type { AdConcept } from "./types"

export interface AdConceptSelectionInput {
  conceptCount: number
  featureFocus: FeatureFocus
  batchSeed: number
  layouts: AdLayoutsFile
  copyTemplates: CopyTemplatesFile
  locale: CopyLang
}

interface Pair { layoutId: string; copyKey: CopyLang }

/** Build the (layouts_for_feature × {locale}) cartesian product.
 *  Exported for testability. Locale is required — the caller narrows
 *  the top-level LanguageCode down to a CopyLang at run boundary. */
export function cartesianPairs(
  layouts: AdLayoutsFile,
  copyTemplates: CopyTemplatesFile,
  feature: FeatureFocus,
  locale: CopyLang,
): Pair[] {
  const layoutIds = Object.keys(layouts.layouts)
    .filter((id) => layouts.layouts[id]!.feature === feature)
    .sort()  // stable ordering for deterministic shuffle
  if (!(locale in copyTemplates.templates)) {
    throw new Error(
      `ad-production: copyTemplates missing required locale '${locale}'`,
    )
  }

  const pairs: Pair[] = []
  for (const layoutId of layoutIds) {
    pairs.push({ layoutId, copyKey: locale })
  }
  return pairs
}

/** Seeded shuffle + top-N slice. Clamps `count` to pairs.length. */
export function pickPairs(pairs: Pair[], count: number, seed: number): Pair[] {
  if (pairs.length === 0) {
    throw new Error("pickPairs: empty pair list (no layouts for feature?)")
  }
  const prng = mulberry32(seed)
  const scored = pairs.map((p) => ({ p, score: prng() }))
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, Math.min(count, pairs.length)).map((s) => s.p)
}

export function generateAdConcepts(input: AdConceptSelectionInput): AdConcept[] {
  const { conceptCount, featureFocus, batchSeed, layouts, copyTemplates, locale } = input

  const pairs = cartesianPairs(layouts, copyTemplates, featureFocus, locale)
  if (pairs.length === 0) {
    throw new Error(
      `ad-production: no layouts registered for featureFocus '${featureFocus}'`,
    )
  }
  const picked = pickPairs(pairs, conceptCount, batchSeed)

  return picked.map(({ layoutId, copyKey }) => {
    const layout = layouts.layouts[layoutId]!
    return {
      id: shortId("cpt", 8),
      title: `${layoutId} · ${copyKey}`,
      description: layout.description,
      tags: [featureFocus, layoutId, copyKey],
      seed: deriveSeed(batchSeed, `${layoutId}:${copyKey}`),
      layoutId,
      copyKey,
      featureFocus,
    }
  })
}
