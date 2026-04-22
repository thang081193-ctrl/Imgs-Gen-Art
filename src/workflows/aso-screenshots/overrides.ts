// Session #15 Q8 — aso-screenshots compatibility overrides.
//
// Same Mock override rationale as ad-production / style-transform: defensive
// pinning so a declarative-logic regression or a Mock capability flag flip
// surfaces as a test failure instead of a silent "incompatible" skip.

import type { CompatibilityOverride } from "@/core/compatibility/types"

export const asoScreenshotsOverrides: readonly CompatibilityOverride[] = [
  {
    providerId: "mock",
    modelId: "mock-fast",
    forceStatus: "compatible",
    reason: "Mock provider accepts all workflow requirements for Phase 3 E2E testing",
  },
] as const
