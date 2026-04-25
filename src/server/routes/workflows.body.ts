// BOOTSTRAP-PHASE3 Step 4 — body + query schemas for /api/workflows.
//
// Colocated per patterns.md Session #2 (.body.ts sibling). Route handler
// imports the validated shape; the actual workflow-specific input shape
// inside `input: unknown` is enforced downstream by precondition #8
// (workflow.inputSchema.parse). Two layers on purpose:
//   - Shape check here (has the 5 required keys, correct types) → 400.
//   - Semantic check in precondition (workflow exists, key active,
//     compatibility, workflow-specific input) → 400/401/404/409.

import { z } from "zod"
import {
  AspectRatioSchema,
  LanguageCodeSchema,
} from "@/core/model-registry/types"
import { PolicyOverrideSchema } from "@/core/schemas/policy-decision"

export const WorkflowRunBodySchema = z.object({
  profileId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  aspectRatio: AspectRatioSchema,
  language: LanguageCodeSchema.optional(),
  input: z.unknown(),
  // Phase D1 (Session #44) — Q-44.C LOCKED: optional override list
  // surfaced through to the runner via WorkflowRunParams.
  policyOverrides: z.array(PolicyOverrideSchema).optional(),
})

export type WorkflowRunBody = z.infer<typeof WorkflowRunBodySchema>
