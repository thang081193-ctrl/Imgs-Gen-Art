// Session #15 Q1 — ad-production concept shape.
//
// AdConcept is the Concept the workflow yields via `concept_generated` events.
// It extends the base Concept with the (layoutId × copyKey × featureFocus)
// triple the prompt composer needs. Downstream consumers (client Workflow
// page, Phase 5 replay) can narrow via `asset.workflowId === "ad-production"`.

import type { Concept } from "@/core/dto/workflow-dto"
import type { FeatureFocus } from "@/core/templates"

export interface AdConcept extends Concept {
  /** Key into data/templates/ad-layouts.json. */
  layoutId: string
  /** Copy-template language code (a CopyLang). Used as the "row" inside
   *  COPY_TEMPLATES[lang] when composing h/s. */
  copyKey: string
  /** FeatureFocus enum value — drives layout eligibility + prompt framing. */
  featureFocus: FeatureFocus
}
