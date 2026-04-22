// Session #15 Q8 — compatibility overrides for ad-production.
//
// Mock override is declared even though the declarative check already
// passes (Mock advertises supportsTextToImage=true + supportsTextInImage).
// Intent: defense against future regressions in the declarative logic or
// in the Mock capability table — integration tests pin Mock as
// "compatible" via override, so a bad flag flip surfaces as a real
// workflow integration failure rather than a silently-skipped suite.

import type { CompatibilityOverride } from "@/core/compatibility/types"

export const adProductionOverrides: readonly CompatibilityOverride[] = [
  {
    providerId: "mock",
    modelId: "mock-fast",
    forceStatus: "compatible",
    reason: "Mock provider accepts all workflow requirements for Phase 3 E2E testing",
  },
] as const
