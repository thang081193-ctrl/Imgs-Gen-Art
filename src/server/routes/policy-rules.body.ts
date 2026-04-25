// PLAN-v3 §4.4 — body schemas for POST /api/policy-rules/* routes.
// C2 (S#42): /rescrape body. C3 (S#43): /preflight body.
//
// `platforms` is optional — omit to scrape all 3 (Q-42.I LOCKED). Each
// entry must be a known PolicyPlatform; the scraper enforces same on
// the service layer too, but Zod-rejecting the wire shape here keeps
// the 400 boundary clean.

import { z } from "zod"

import { PolicyOverrideSchema } from "@/core/schemas/policy-decision"
import { PolicyPlatformSchema } from "@/core/schemas/policy-rule"

export const RescrapePolicyRulesBodySchema = z
  .object({
    platforms: z.array(PolicyPlatformSchema).min(1).optional(),
  })
  .strict()

export type RescrapePolicyRulesBody = z.infer<
  typeof RescrapePolicyRulesBodySchema
>

// Q-43.F LOCKED: asset-* fields all optional because preflight runs
// before the asset is generated. Aspect-ratio is `\d+:\d+` (mirrors the
// PolicyRule pattern). File-size + resolution must be positive ints.
const ASPECT_RATIO_RE = /^\d+:\d+$/

export const PreflightPolicyRulesBodySchema = z
  .object({
    platform: PolicyPlatformSchema,
    prompt: z.string().max(20000).optional(),
    copyTexts: z.array(z.string().max(5000)).max(50).optional(),
    assetWidth: z.number().int().positive().optional(),
    assetHeight: z.number().int().positive().optional(),
    assetFileSizeBytes: z.number().int().positive().optional(),
    assetAspectRatio: z.string().regex(ASPECT_RATIO_RE).optional(),
    overrides: z.array(PolicyOverrideSchema).optional(),
  })
  .strict()

export type PreflightPolicyRulesBody = z.infer<
  typeof PreflightPolicyRulesBodySchema
>
