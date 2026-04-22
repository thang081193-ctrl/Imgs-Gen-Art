// Session #15 Q2 — style-transform concept generation.
//
// Each batch has ONE (sourceAssetId, styleDnaKey) pair; the conceptCount
// determines how many distinct "interpretations" (different seeds, same
// style) to emit. Per Q7 the base salt is `${styleDnaKey}:${sourceAssetId}`;
// we suffix the 1-indexed serial so each concept's seed is unique while
// still deterministic for a fixed (batchSeed, pair, serial) triple.

import type { ArtStyleKey, StyleDnaFile } from "@/core/templates"
import { shortId } from "@/core/shared/id"
import { deriveSeed } from "@/core/shared/rand"

import type { StyleConcept } from "./types"

export interface StyleConceptSelectionInput {
  conceptCount: number
  styleDnaKey: ArtStyleKey
  sourceAssetId: string
  batchSeed: number
  styles: StyleDnaFile
}

export function generateStyleConcepts(input: StyleConceptSelectionInput): StyleConcept[] {
  const { conceptCount, styleDnaKey, sourceAssetId, batchSeed, styles } = input
  const style = styles.styles[styleDnaKey]
  if (!style) {
    throw new Error(`style-transform: unknown styleDnaKey '${styleDnaKey}'`)
  }

  const baseSalt = `${styleDnaKey}:${sourceAssetId}`
  const concepts: StyleConcept[] = []
  for (let i = 0; i < conceptCount; i++) {
    const serial = i + 1
    concepts.push({
      id: shortId("cpt", 8),
      title: `${style.label} · #${serial}`,
      description: style.promptCues,
      tags: [styleDnaKey, sourceAssetId],
      seed: deriveSeed(batchSeed, `${baseSalt}:${serial}`),
      styleDnaKey,
      sourceAssetId,
      serial,
    })
  }
  return concepts
}
