// Plan §5.4 — ReplayPayload Zod schema. v2.2 adds `language?` field.

import { z } from "zod"
import { AspectRatioSchema, LanguageCodeSchema } from "../model-registry/types"
import { AppProfileSchema } from "./app-profile"

export const ReplayPayloadSchema = z.object({
  version: z.literal(1),
  prompt: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  aspectRatio: AspectRatioSchema,
  language: LanguageCodeSchema.optional(),
  seed: z.number().int().optional(),
  providerSpecificParams: z
    .object({
      addWatermark: z.boolean().optional(),
      negativePrompt: z.string().optional(),
    })
    .passthrough(),
  promptTemplateId: z.string(),
  promptTemplateVersion: z.string(),
  contextSnapshot: z.object({
    profileId: z.string(),
    profileVersion: z.number().int(),
    profileSnapshot: AppProfileSchema,
  }),
})

export type ReplayPayload = z.infer<typeof ReplayPayloadSchema>
