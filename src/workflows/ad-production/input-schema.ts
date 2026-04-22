// Session #15 Q1 — ad-production input schema.
//
// MUST NOT declare `aspectRatio` or `language` — those are top-level
// WorkflowRunParams. `featureFocus` picks which LAYOUTS bucket the seeded
// shuffle draws from; `copyKey` is chosen per-concept by the generator,
// not by the user.

import { z } from "zod"
import { FeatureFocusSchema } from "@/core/templates"

export const AdProductionInputSchema = z.object({
  conceptCount: z.number().int().min(1).max(10).default(4),
  variantsPerConcept: z.number().int().min(1).max(4).default(1),
  featureFocus: FeatureFocusSchema,
  seed: z.number().int().optional(),
}).strict()

export type AdProductionInput = z.infer<typeof AdProductionInputSchema>
