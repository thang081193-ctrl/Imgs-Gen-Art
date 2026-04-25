// Session #37 Phase A1 — body schemas for /api/saved-styles.
//
// Colocated per patterns.md (.body.ts sibling). `slug` is constrained to
// kebab-case so user input matches the lookup-by-slug pattern the seed
// uses for presets. `lanes` requires at least one tag — a saved style
// with no lane tags is invisible everywhere and serves no purpose.

import { z } from "zod"

const SlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be kebab-case (a-z, 0-9, hyphens)")

const LaneTagSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)?$/, "lane tag must be 'lane' or 'lane.platform' (lowercase)")

export const SavedStyleCreateBodySchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
  promptTemplate: z.string().min(1).max(8000),
  previewAssetId: z.string().min(1).nullish(),
  lanes: z.array(LaneTagSchema).min(1).max(8),
})

export const SavedStyleUpdateBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable(),
    promptTemplate: z.string().min(1).max(8000),
    previewAssetId: z.string().min(1).nullable(),
    lanes: z.array(LaneTagSchema).min(1).max(8),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "PATCH body must include at least one field",
  })

export type SavedStyleCreateBody = z.infer<typeof SavedStyleCreateBodySchema>
export type SavedStyleUpdateBody = z.infer<typeof SavedStyleUpdateBodySchema>
