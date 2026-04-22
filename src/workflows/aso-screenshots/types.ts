// Session #15 Q3 — aso-screenshots concept shape.
//
// AsoConcept extends Concept with the layoutId (from the phone-UI subset
// of ad-layouts). Target languages are NOT on the concept — each concept
// is rendered once per entry in input.targetLangs so the (concept × lang)
// matrix expands in the runner, not in the concept list.

import type { Concept } from "@/core/dto/workflow-dto"

export interface AsoConcept extends Concept {
  /** Key into data/templates/ad-layouts.json, always a hasPhoneUI=true layout. */
  layoutId: string
}
