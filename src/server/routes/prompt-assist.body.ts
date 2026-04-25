// Session #39 Phase B1 — body schemas for /api/prompt-assist.
//
// 3 endpoints, 3 bodies. `reverse-from-image` uses multipart (no zod body —
// route parses formData manually), so only the 2 JSON-bodied endpoints have
// schemas here.

import { z } from "zod"

const LaneSchema = z.enum([
  "ads.meta",
  "ads.google-ads",
  "aso.play",
  "artwork-batch",
])

const PlatformSchema = z.string().min(1).max(64)
const ProfileIdSchema = z.string().min(1).max(64)

export const IdeaToPromptBodySchema = z.object({
  idea: z.string().min(3).max(2000),
  lane: LaneSchema,
  platform: PlatformSchema.optional(),
  profileId: ProfileIdSchema.optional(),
})

export const TextOverlayBodySchema = z
  .object({
    image: z.string().regex(/^data:image\/[\w+]+;base64,/, "must be data:image base64 URL").optional(),
    description: z.string().min(1).max(1000).optional(),
    headline: z.string().min(1).max(200).optional(),
    profileId: ProfileIdSchema.optional(),
  })
  .refine(
    (b) => Boolean(b.image || b.description || b.headline),
    { message: "at least one of image, description, headline is required" },
  )

export type IdeaToPromptBody = z.infer<typeof IdeaToPromptBodySchema>
export type TextOverlayBody = z.infer<typeof TextOverlayBodySchema>
