// PLAN-v3 §4.3 — PolicyDecision Zod schema (Phase C3, Session #43).
//
// Output shape of `checkPolicy()` (the function the wizard's preflight
// badge and `finalizeBatch()` both consume). Strict mode is intentional:
// route handlers and the audit-blob writer round-trip the JSON via this
// schema, so unknown keys throw early instead of leaking into
// `batches.policy_decision_json`.
//
// Q-43.B LOCKED: top-level `{ decidedAt, ruleSetVersion?, ok, violations,
// overrides? }`. `ruleSetVersion` is reserved for D-phase (rule-set
// hashing); C3 ships it as optional placeholder so the audit shape
// doesn't break when D-phase fills it in.

import { z } from "zod"

import { PolicySeveritySchema } from "./policy-rule"

// PLAN-v3 §4.3.1 — One violation per matched rule instance (Q-43.E
// LOCKED: keyword/claim-regex matches are 1-per-keyword so the wizard
// UI can highlight each match). `details` is a free-form metadata bag
// the per-kind checker fills (matched term, observed value, expected
// allow-list, etc.) — Zod-typed as `unknown` record because each kind
// surfaces different fields.
export const PolicyViolationSchema = z
  .object({
    ruleId: z.string().min(1),
    severity: PolicySeveritySchema,
    kind: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.unknown()).optional(),
  })
  .strict()
export type PolicyViolation = z.infer<typeof PolicyViolationSchema>

// PLAN-v3 §4.3.2 — Override payload. Q-43.D LOCKED: only
// `severity:"warning"` violations can be overridden — the aggregator
// silently ignores overrides targeting `severity:"block"` rules so a
// malicious / mistaken client can't bypass a block by passing an
// override row.
export const PolicyOverrideSchema = z
  .object({
    ruleId: z.string().min(1),
    reason: z.string().min(1).max(2000),
    decidedBy: z.string().min(1).optional(),
    decidedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
export type PolicyOverride = z.infer<typeof PolicyOverrideSchema>

// PLAN-v3 §4.3 — `ok` is `true` iff there are no remaining
// `severity:"block"` violations after override application. Warning
// violations may exist on an `ok:true` decision (they're informational
// once overridden — kept in the array so the audit blob shows what was
// surfaced + waved through).
export const PolicyDecisionSchema = z
  .object({
    decidedAt: z.string().datetime({ offset: true }),
    ruleSetVersion: z.string().optional(),
    ok: z.boolean(),
    violations: z.array(PolicyViolationSchema),
    overrides: z.array(PolicyOverrideSchema).optional(),
  })
  .strict()
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>
