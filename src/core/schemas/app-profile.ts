// Plan §5.1 — AppProfile storage-level Zod schema.
// v2.2: uses `appLogoAssetId` (not path). Lives under `data/profiles/{id}.json`.

import { z } from "zod"

export const AppProfileCategorySchema = z.enum([
  "utility",
  "lifestyle",
  "productivity",
  "entertainment",
  "education",
])

export const AppProfileToneSchema = z.enum([
  "minimal",
  "bold",
  "playful",
  "elegant",
  "technical",
  "warm",
])

export const AppProfileMarketTierSchema = z.enum([
  "tier1",
  "tier2",
  "tier3",
  "global",
])

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export const AppProfileSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  category: AppProfileCategorySchema,

  assets: z.object({
    appLogoAssetId: z.string().nullable(),
    storeBadgeAssetId: z.string().nullable(),
    screenshotAssetIds: z.array(z.string()).default([]),
  }),

  visual: z.object({
    primaryColor: z.string().regex(HEX_COLOR),
    secondaryColor: z.string().regex(HEX_COLOR),
    accentColor: z.string().regex(HEX_COLOR),
    tone: AppProfileToneSchema,
    doList: z.array(z.string()),
    dontList: z.array(z.string()),
  }),

  positioning: z.object({
    usp: z.string(),
    targetPersona: z.string(),
    marketTier: AppProfileMarketTierSchema,
    competitors: z.array(z.string()).optional(),
  }),

  context: z.object({
    features: z.array(z.string()),
    keyScenarios: z.array(z.string()),
    forbiddenContent: z.array(z.string()),
  }),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type AppProfile = z.infer<typeof AppProfileSchema>
