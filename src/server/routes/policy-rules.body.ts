// PLAN-v3 §4.4 — body schema for POST /api/policy-rules/rescrape
// (Phase C2, Session #42).
//
// `platforms` is optional — omit to scrape all 3 (Q-42.I LOCKED). Each
// entry must be a known PolicyPlatform; the scraper enforces same on
// the service layer too, but Zod-rejecting the wire shape here keeps
// the 400 boundary clean.

import { z } from "zod"

import { PolicyPlatformSchema } from "@/core/schemas/policy-rule"

export const RescrapePolicyRulesBodySchema = z
  .object({
    platforms: z.array(PolicyPlatformSchema).min(1).optional(),
  })
  .strict()

export type RescrapePolicyRulesBody = z.infer<
  typeof RescrapePolicyRulesBodySchema
>
