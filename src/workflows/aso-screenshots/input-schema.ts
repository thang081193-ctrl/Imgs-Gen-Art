// Session #15 Q3 — aso-screenshots input schema.
//
// `targetLangs` drawn from CopyLangSchema (the 10-lang set actually present
// in copy-templates.json — see Session #15 resolution C for why we don't
// hard-code a bespoke 10-lang list). Max 3 per Q3 — targetLangs × conceptCount
// × variants grows exponentially and this is Phase 3 cost/latency control.
// Runtime validator in run() enforces targetLangs ⊆ provider.supportedLanguages.

import { z } from "zod"
import { CopyLangSchema } from "@/core/templates"

export const AsoScreenshotsInputSchema = z.object({
  conceptCount: z.number().int().min(1).max(10).default(3),
  variantsPerConcept: z.number().int().min(1).max(4).default(1),
  targetLangs: z.array(CopyLangSchema).min(1).max(3),
  seed: z.number().int().optional(),
}).strict()

export type AsoScreenshotsInput = z.infer<typeof AsoScreenshotsInputSchema>
