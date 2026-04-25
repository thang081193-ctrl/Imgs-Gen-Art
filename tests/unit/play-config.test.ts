// @vitest-environment jsdom
//
// Phase F2 (Session #44) — Play ASO config mappers.

import { describe, expect, it } from "vitest"

import {
  playConfig,
  type PlayWizardForm,
} from "@/client/lane-wizards/play-config"

function clone(s: PlayWizardForm): PlayWizardForm {
  return { ...s, targetLangs: [...s.targetLangs] }
}

describe("play-config — buildPreflightInput", () => {
  it("emits platform=play + assetAspectRatio + concept/lang summary prompt", () => {
    const out = playConfig.buildPreflightInput(clone(playConfig.initialState()))
    expect(out.platform).toBe("play")
    expect(out.assetAspectRatio).toBe("9:16")
    expect(out.prompt).toContain("Play Store screenshot")
  })
})

describe("play-config — buildRunBody", () => {
  it("packages aso-screenshots input + run params; omits seed when empty", () => {
    const body = playConfig.buildRunBody(
      clone(playConfig.initialState()),
      "chartlens",
    )
    expect(body.profileId).toBe("chartlens")
    expect(body.providerId).toBe("mock")
    expect(body.modelId).toBe("mock-fast")
    expect(body.aspectRatio).toBe("9:16")
    expect(body.input).toEqual({
      conceptCount: 2,
      variantsPerConcept: 1,
      targetLangs: ["en"],
    })
  })

  it("threads seed when bro entered an integer", () => {
    const s: PlayWizardForm = { ...playConfig.initialState(), seed: "21" }
    const body = playConfig.buildRunBody(s, "chartlens")
    expect(body.input).toMatchObject({ seed: 21 })
  })
})

describe("play-config — Step validations", () => {
  it("Step 1 rejects advance until profileId picked", () => {
    const step1 = playConfig.inputSteps[0]!
    expect(step1.validate?.(playConfig.initialState())).toMatch(/profile/i)
    const filled: PlayWizardForm = {
      ...playConfig.initialState(),
      profileId: "chartlens",
    }
    expect(step1.validate?.(filled)).toBeNull()
  })

  it("Step 2 rejects advance when targetLangs is empty", () => {
    const step2 = playConfig.inputSteps[1]!
    const empty: PlayWizardForm = {
      ...playConfig.initialState(),
      profileId: "chartlens",
      targetLangs: [],
    }
    expect(step2.validate?.(empty)).toMatch(/target language/i)
    const filled: PlayWizardForm = { ...empty, targetLangs: ["en"] }
    expect(step2.validate?.(filled)).toBeNull()
  })
})
