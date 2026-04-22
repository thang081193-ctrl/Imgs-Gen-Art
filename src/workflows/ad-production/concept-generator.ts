// Session #15 Q1 — ad-production concept selection.
//
// Algorithm (per Q1): cartesian product of (layouts_for_feature × copyKeys),
// mulberry32-seeded shuffle, pick top `conceptCount`. Each picked pair
// becomes one AdConcept with a unique per-concept seed derived via
// `deriveSeed(batchSeed, "${layoutId}:${copyKey}")`.
//
// Output is deterministic for a fixed (featureFocus, batchSeed).

import type { AdLayoutsFile, CopyTemplatesFile, FeatureFocus } from "@/core/templates"
import { shortId } from "@/core/shared/id"
import { deriveSeed, mulberry32 } from "@/core/shared/rand"

import type { AdConcept } from "./types"

export interface AdConceptSelectionInput {
  conceptCount: number
  featureFocus: FeatureFocus
  batchSeed: number
  layouts: AdLayoutsFile
  copyTemplates: CopyTemplatesFile
}

interface Pair { layoutId: string; copyKey: string }

/** Build the (layouts_for_feature × copyKeys) cartesian product.
 *  Exported for testability. */
export function cartesianPairs(
  layouts: AdLayoutsFile,
  copyTemplates: CopyTemplatesFile,
  feature: FeatureFocus,
): Pair[] {
  const layoutIds = Object.keys(layouts.layouts)
    .filter((id) => layouts.layouts[id]!.feature === feature)
    .sort()  // stable ordering for deterministic shuffle
  const copyKeys = Object.keys(copyTemplates.templates).sort()

  const pairs: Pair[] = []
  for (const layoutId of layoutIds) {
    for (const copyKey of copyKeys) {
      pairs.push({ layoutId, copyKey })
    }
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
  const { conceptCount, featureFocus, batchSeed, layouts, copyTemplates } = input

  const pairs = cartesianPairs(layouts, copyTemplates, featureFocus)
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
