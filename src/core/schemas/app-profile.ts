// Plan §5.1 — AppProfile storage-level Zod schema.
//
// v2 migration pattern (DECISIONS §F.1 / §F.2): discriminated by the
// `version` field through `z.union([V1, V2]).transform(migrateToV2)`.
// Consumers see `AppProfile` = the latest output type; v1/v2 are
// internal. To add v3+:
//   1. Declare `V3Schema = AppProfileBodyFields.extend({ version: <v3> })`.
//   2. Extend the union + the `migrateToV2` fn into a `migrateToV3`
//      pipeline (each step unidirectional, forward-only).
//   3. Rename + re-run `scripts/migrate-profiles-v1-to-v2.ts` as
//      `scripts/migrate-profiles-v2-to-v3.ts` (idempotent one-off).

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

// Fields shared across every version. When v3+ adds or renames a
// field, branch-specific overrides go on the branch (V1/V2/V3Schema);
// shared shape lives here. Exported so the body-schema layer (create/
// update) can `.omit({version})` without reaching into a specific
// version branch — v2 migration DECISIONS §F.1.
export const AppProfileBodyFields = z.object({
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

export const AppProfileV1Schema = AppProfileBodyFields.extend({
  version: z.literal(1),
})

export const AppProfileV2Schema = AppProfileBodyFields.extend({
  version: z.number().int().min(1),
})

export type AppProfileV1 = z.infer<typeof AppProfileV1Schema>
export type AppProfileV2 = z.infer<typeof AppProfileV2Schema>

// v2a (DECISIONS §F.2): identity transform. v1's literal(1) already
// satisfies v2's number().int().min(1) — shape is unchanged. Kept as
// an explicit fn so v3+ migrations slot in without reshaping callers.
function migrateToV2(parsed: AppProfileV1 | AppProfileV2): AppProfileV2 {
  return parsed
}

// Plain z.union (not z.discriminatedUnion): discriminator would need
// all branches to declare version as a literal, but V2 widens to
// z.number(). Union tries V1 first — matches when version === 1 — and
// falls through to V2 otherwise. Transform runs on the parsed result.
export const AppProfileSchema = z
  .union([AppProfileV1Schema, AppProfileV2Schema])
  .transform(migrateToV2)

export type AppProfile = z.output<typeof AppProfileSchema>
