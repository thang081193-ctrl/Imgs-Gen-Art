// Session #15 Q3 — aso-screenshots concept selection.
//
// ASO screenshots reuse the ad-layouts catalog but filter to phone-UI
// layouts only (`hasPhoneUI: true`) since ASO previews are always
// device-framed. The seeded shuffle picks `conceptCount` unique layoutIds
// from that pool.
//
// Concept seed = deriveSeed(batchSeed, layoutId). Per-asset seed (one per
// targetLang) is derived in the runner via Q7 salt `${layoutId}:${lang}`
// so each (concept, lang) asset has a unique deterministic seed.

import type { AdLayoutsFile } from "@/core/templates"
import { shortId } from "@/core/shared/id"
import { deriveSeed, mulberry32 } from "@/core/shared/rand"

import type { AsoConcept } from "./types"

export interface AsoConceptSelectionInput {
  conceptCount: number
  batchSeed: number
  layouts: AdLayoutsFile
}

/** Subset of layouts keyed by hasPhoneUI=true. Sorted for shuffle stability. */
export function phoneUiLayoutIds(layouts: AdLayoutsFile): string[] {
  return Object.keys(layouts.layouts)
    .filter((id) => layouts.layouts[id]!.hasPhoneUI)
    .sort()
}

export function pickAsoLayouts(
  ids: string[],
  count: number,
  seed: number,
): string[] {
  if (ids.length === 0) {
    throw new Error("aso-screenshots: no phone-UI layouts available")
  }
  const prng = mulberry32(seed)
  const scored = ids.map((id) => ({ id, score: prng() }))
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, Math.min(count, ids.length)).map((s) => s.id)
}

export function generateAsoConcepts(input: AsoConceptSelectionInput): AsoConcept[] {
  const { conceptCount, batchSeed, layouts } = input
  const pool = phoneUiLayoutIds(layouts)
  const picked = pickAsoLayouts(pool, conceptCount, batchSeed)

  return picked.map((layoutId) => {
    const layout = layouts.layouts[layoutId]!
    return {
      id: shortId("cpt", 8),
      title: layoutId,
      description: layout.description,
      tags: [layout.feature, layoutId],
      seed: deriveSeed(batchSeed, layoutId),
      layoutId,
    }
  })
}
