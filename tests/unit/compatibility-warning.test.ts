// Phase 4 Step 6 (Session #22) — getBannerMessage pure-fn fallback logic.
//
// The component itself is verified via typecheck + browser smoke per
// Session #16/#20 client-UI convention. This test pins the one branch
// that benefits from headless assertion: reason → passthrough vs. empty
// / whitespace / undefined → server-agnostic fallback copy.

import { describe, expect, it } from "vitest"
import {
  COMPAT_FALLBACK_REASON,
  getBannerMessage,
} from "@/client/components/workflow/compatibility-warning"

describe("getBannerMessage", () => {
  it("returns server reason verbatim when non-empty", () => {
    const reason = "Imagen 4 lacks supportsImageEditing required by style-transform"
    expect(getBannerMessage(reason)).toBe(reason)
  })

  it("falls back when reason is undefined", () => {
    expect(getBannerMessage(undefined)).toBe(COMPAT_FALLBACK_REASON)
  })

  it("falls back when reason is empty string", () => {
    expect(getBannerMessage("")).toBe(COMPAT_FALLBACK_REASON)
  })

  it("falls back when reason is whitespace-only", () => {
    expect(getBannerMessage("   ")).toBe(COMPAT_FALLBACK_REASON)
  })

  it("trims surrounding whitespace on passthrough", () => {
    expect(getBannerMessage("  real reason  ")).toBe("real reason")
  })
})
