// Session #15 Q2 — style-transform concept shape.
//
// StyleConcept extends base Concept with the (styleDnaKey × sourceAssetId)
// pair plus the concept's serial index (1..conceptCount). The pair is
// constant across all concepts in a single batch (one source, one style);
// the index disambiguates seeds so each concept yields a visually different
// interpretation of the same transformation.

import type { Concept } from "@/core/dto/workflow-dto"
import type { ArtStyleKey } from "@/core/templates"

export interface StyleConcept extends Concept {
  styleDnaKey: ArtStyleKey
  sourceAssetId: string
  /** 1-indexed serial so display titles read "ANIME · #1 of 3". */
  serial: number
}
