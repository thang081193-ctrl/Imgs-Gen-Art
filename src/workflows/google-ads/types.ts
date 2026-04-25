// Phase E (Session #44) — google-ads workflow types.
//
// Text-only ad generator: each "concept" packages a single ad-set worth
// of headlines + descriptions for a given featureFocus. The base
// Concept is reused so workflow-events.ts shape stays uniform across
// the 5 workflows.

import type { Concept } from "@/core/dto/workflow-dto"
import type { FeatureFocus } from "@/core/templates"

export interface GoogleAdConcept extends Concept {
  /** FeatureFocus enum — drives the LLM prompt's positioning hints. */
  featureFocus: FeatureFocus
  /** N short headlines for the responsive search ad. */
  headlines: string[]
  /** M descriptions to pair with the headlines. */
  descriptions: string[]
}
