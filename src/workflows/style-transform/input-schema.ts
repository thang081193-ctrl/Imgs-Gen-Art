// Session #15 Q2 — style-transform input schema.
//
// `sourceImageAssetId` MUST resolve to a profile_asset row with kind
// "screenshot" — validated by the run()-level precondition. `styleDnaKey`
// picks one of the 3 ART_STYLES entries (ANIME / GHIBLI / PIXAR).
//
// No `aspectRatio` / `language` fields (top-level run params).

import { z } from "zod"

const StyleDnaKeySchema = z.enum(["ANIME", "GHIBLI", "PIXAR"])

export const StyleTransformInputSchema = z.object({
  sourceImageAssetId: z.string().min(1),
  styleDnaKey: StyleDnaKeySchema,
  conceptCount: z.number().int().min(1).max(10).default(3),
  variantsPerConcept: z.number().int().min(1).max(4).default(1),
  seed: z.number().int().optional(),
}).strict()

export type StyleTransformInput = z.infer<typeof StyleTransformInputSchema>
