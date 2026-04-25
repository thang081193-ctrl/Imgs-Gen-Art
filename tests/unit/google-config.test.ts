// @vitest-environment jsdom
//
// Phase E (Session #44) — google-config wizard mappers.

import { describe, expect, it } from "vitest"

import {
  googleConfig,
  type GoogleAdsWizardForm,
} from "@/client/lane-wizards/google-config"

function clone(s: GoogleAdsWizardForm): GoogleAdsWizardForm {
  return { ...s }
}

describe("google-config — buildPreflightInput", () => {
  it("emits platform=google-ads + featureFocus prompt + empty copyTexts", () => {
    const out = googleConfig.buildPreflightInput(clone(googleConfig.initialState()))
    expect(out.platform).toBe("google-ads")
    expect(out.prompt).toContain("featureFocus=restore")
    expect(out.copyTexts).toEqual([])
    expect(out.assetAspectRatio).toBeUndefined()
  })
})

describe("google-config — buildRunBody", () => {
  it("packages workflow input + run params; omits seed when empty", () => {
    const body = googleConfig.buildRunBody(
      clone(googleConfig.initialState()),
      "chartlens",
    )
    expect(body.profileId).toBe("chartlens")
    expect(body.providerId).toBe("mock")
    expect(body.modelId).toBe("mock-fast")
    expect(body.input).toEqual({
      featureFocus: "restore",
      headlineCount: 5,
      descriptionCount: 3,
    })
  })

  it("threads seed when bro entered an integer", () => {
    const s: GoogleAdsWizardForm = { ...googleConfig.initialState(), seed: "13" }
    const body = googleConfig.buildRunBody(s, "chartlens")
    expect(body.input).toMatchObject({ seed: 13 })
  })
})

describe("google-config — Step 1 validation", () => {
  it("rejects advance until profileId picked", () => {
    const step1 = googleConfig.inputSteps[0]!
    expect(step1.validate?.(googleConfig.initialState())).toMatch(/profile/i)
    const filled: GoogleAdsWizardForm = {
      ...googleConfig.initialState(),
      profileId: "chartlens",
    }
    expect(step1.validate?.(filled)).toBeNull()
  })
})
