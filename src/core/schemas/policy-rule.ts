// PLAN-v3 §4.1 — PolicyRule Zod schema (Phase C1, Session #41).
//
// Locks the data shape that Phase C2 (scraper) writes into and Phase C3
// (enforcement) reads from. Strict mode is intentional (Q-41.G): unknown
// keys throw at load time so bro-edited hand-curated JSON catches typos
// up-front and scraper bugs surface immediately.
//
// To add a new PolicyPattern kind: extend the discriminated union, bump
// any consuming enforcement code, then update the seed JSON + scraper.

import { z } from "zod"

export const PolicyPlatformSchema = z.enum([
  "meta",
  "google-ads",
  "play",
])
export type PolicyPlatform = z.infer<typeof PolicyPlatformSchema>

export const PolicySeveritySchema = z.enum(["warning", "block"])
export type PolicySeverity = z.infer<typeof PolicySeveritySchema>

export const PolicySourceSchema = z.enum(["scraped", "hand-curated"])
export type PolicySource = z.infer<typeof PolicySourceSchema>

// PLAN-v3 §4.1.1 — six pattern kinds. Each is independently checkable;
// enforcement (C3) dispatches on `kind`.
const TextAreaRatioSchema = z
  .object({
    kind: z.literal("text-area-ratio"),
    maxRatio: z.number().min(0).max(1),
  })
  .strict()

const KeywordBlocklistSchema = z
  .object({
    kind: z.literal("keyword-blocklist"),
    keywords: z.array(z.string().min(1)).min(1),
    caseInsensitive: z.boolean().default(true),
  })
  .strict()

const AspectRatioSchema = z
  .object({
    kind: z.literal("aspect-ratio"),
    allowed: z.array(z.string().regex(/^\d+:\d+$/)).min(1),
  })
  .strict()

const FileSizeMaxSchema = z
  .object({
    kind: z.literal("file-size-max"),
    maxBytes: z.number().int().positive(),
  })
  .strict()

const ResolutionMinSchema = z
  .object({
    kind: z.literal("resolution-min"),
    minWidth: z.number().int().positive(),
    minHeight: z.number().int().positive(),
  })
  .strict()

const ClaimRegexSchema = z
  .object({
    kind: z.literal("claim-regex"),
    pattern: z.string().min(1),
    flags: z.string().optional(),
  })
  .strict()

export const PolicyPatternSchema = z.discriminatedUnion("kind", [
  TextAreaRatioSchema,
  KeywordBlocklistSchema,
  AspectRatioSchema,
  FileSizeMaxSchema,
  ResolutionMinSchema,
  ClaimRegexSchema,
])
export type PolicyPattern = z.infer<typeof PolicyPatternSchema>

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

export const PolicyRuleSchema = z
  .object({
    id: z.string().regex(ID_PATTERN, "id must be kebab-case"),
    platform: PolicyPlatformSchema,
    format: z.string().optional(),
    category: z.string().min(1),
    description: z.string().min(1),
    severity: PolicySeveritySchema,
    pattern: PolicyPatternSchema,
    sourceUrl: z.string().url().optional(),
    lastReviewedAt: z.string().datetime({ offset: true }).or(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    ),
    source: PolicySourceSchema,
  })
  .strict()
export type PolicyRule = z.infer<typeof PolicyRuleSchema>

export const ScrapedPolicyRuleFileSchema = z
  .object({
    scrapedAt: z.string().datetime({ offset: true }),
    rules: z.array(PolicyRuleSchema),
  })
  .strict()
export type ScrapedPolicyRuleFile = z.infer<typeof ScrapedPolicyRuleFileSchema>

export const HandCuratedPolicyRuleFileSchema = z
  .object({
    rules: z.array(PolicyRuleSchema),
  })
  .strict()
export type HandCuratedPolicyRuleFile = z.infer<
  typeof HandCuratedPolicyRuleFileSchema
>
