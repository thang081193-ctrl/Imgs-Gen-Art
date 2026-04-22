// Session #15 Q8 — style-transform compatibility overrides.
//
// Declarative requirements (supportsImageEditing + supportsStyleReference)
// already exclude Imagen 4 correctly — Imagen doesn't support image editing
// so the matrix shows "incompatible" for it, which is the intended Phase 3
// behavior. Mock passes declaratively too (all capability flags true) but
// we pin it via override per Q8 so flag regressions surface in tests.

import type { CompatibilityOverride } from "@/core/compatibility/types"

export const styleTransformOverrides: readonly CompatibilityOverride[] = [
  {
    providerId: "mock",
    modelId: "mock-fast",
    forceStatus: "compatible",
    reason: "Mock provider accepts all workflow requirements for Phase 3 E2E testing",
  },
] as const
