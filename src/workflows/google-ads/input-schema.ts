// Phase E (Session #44) — google-ads input schema (Q-46.A LOCKED).
//
// Text-only — no aspectRatio / language / variant counts. Each batch
// produces ONE ad set (headlineCount headlines + descriptionCount
// descriptions); the LLM call returns the full set in a single
// response. Bounds mirror Google's Responsive Search Ad limits
// (15 headlines / 4 descriptions max).

import { z } from "zod"
import { FeatureFocusSchema } from "@/core/templates"

export const GoogleAdsInputSchema = z
  .object({
    headlineCount: z.number().int().min(1).max(15).default(5),
    descriptionCount: z.number().int().min(1).max(4).default(3),
    featureFocus: FeatureFocusSchema,
    seed: z.number().int().optional(),
  })
  .strict()

export type GoogleAdsInput = z.infer<typeof GoogleAdsInputSchema>
