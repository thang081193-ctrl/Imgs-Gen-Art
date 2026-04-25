// Plan §6.3 — WorkflowEvent (transport-safe; carries AssetDto, never raw Asset).

import type { AssetDto } from "./asset-dto"
import type { PolicyDecision } from "@/core/schemas/policy-decision"

export interface Concept {
  id: string
  title: string
  description: string
  // Per Session #11 Q5: seed is REQUIRED so Phase 5 replay can re-run
  // one variant deterministically. All workflow runners derive a stable
  // per-concept seed from (batchSeed, concept.title).
  seed: number
  tags: string[]
}

// Phase D1 (Session #44) — policy events fire at preflight time, BEFORE
// per-asset image events. X-2 LOCKED: platform-agnostic — the wizard
// dispatches off `decision` (PolicyDecision is the universal payload),
// not the workflow id, so a single hook works across Meta / Google / Play.
export type WorkflowEvent =
  | { type: "started"; batchId: string; total: number }
  | { type: "concept_generated"; concept: Concept; index: number }
  | { type: "image_generated"; asset: AssetDto; index: number }
  | { type: "error"; error: { message: string; code?: string }; context: string; index?: number }
  | { type: "aborted"; batchId: string; completedCount: number; totalCount: number }
  | { type: "complete"; assets: AssetDto[]; batchId: string }
  | { type: "policy_blocked"; decision: PolicyDecision; batchId: string }
  | { type: "policy_warned"; decision: PolicyDecision; batchId: string }
