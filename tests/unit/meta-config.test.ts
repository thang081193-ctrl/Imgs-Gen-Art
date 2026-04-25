// @vitest-environment jsdom
//
// Phase D2 (Session #44) — Meta lane config: form → preflight + form →
// run-body mappers. The wizard chassis trusts these to build the right
// shape; if either drifts, every Meta wizard run misroutes.

import { describe, expect, it } from "vitest"

import { metaConfig, type MetaWizardForm } from "@/client/lane-wizards/meta-config"

function clone(state: MetaWizardForm): MetaWizardForm {
  return { ...state }
}

describe("meta-config — buildPreflightInput", () => {
  it("emits platform=meta + assetAspectRatio + featureFocus prompt", () => {
    const s = clone(metaConfig.initialState())
    const out = metaConfig.buildPreflightInput(s)
    expect(out.platform).toBe("meta")
    expect(out.assetAspectRatio).toBe("1:1")
    expect(out.prompt).toContain("featureFocus=restore")
  })

  it("retains aspect-ratio change from Step 2", () => {
    const s: MetaWizardForm = { ...metaConfig.initialState(), aspectRatio: "9:16" }
    const out = metaConfig.buildPreflightInput(s)
    expect(out.assetAspectRatio).toBe("9:16")
  })
})

describe("meta-config — buildRunBody", () => {
  it("packages workflow input + top-level run params; omits seed when empty", () => {
    const s = clone(metaConfig.initialState())
    const body = metaConfig.buildRunBody(s, "chartlens")
    expect(body.profileId).toBe("chartlens")
    expect(body.providerId).toBe("mock")
    expect(body.modelId).toBe("mock-fast")
    expect(body.aspectRatio).toBe("1:1")
    expect(body.language).toBe("en")
    expect(body.input).toEqual({
      featureFocus: "restore",
      conceptCount: 4,
      variantsPerConcept: 1,
    })
    // No policyOverrides at the config level — chassis splices them in.
    expect(body.policyOverrides).toBeUndefined()
  })

  it("threads seed when bro entered an integer", () => {
    const s: MetaWizardForm = { ...metaConfig.initialState(), seed: "42" }
    const body = metaConfig.buildRunBody(s, "chartlens")
    expect(body.input).toMatchObject({ seed: 42 })
  })

  it("drops non-integer seed input rather than passing NaN to the runner", () => {
    const s: MetaWizardForm = { ...metaConfig.initialState(), seed: "not-a-number" }
    const body = metaConfig.buildRunBody(s, "chartlens")
    expect(body.input).not.toMatchObject({ seed: expect.any(Number) })
  })
})

describe("meta-config — Step 1 validation", () => {
  it("rejects advance until profileId picked; passes once set", () => {
    const step1 = metaConfig.inputSteps[0]!
    const empty: MetaWizardForm = metaConfig.initialState()
    expect(step1.validate?.(empty)).toMatch(/profile/i)
    const filled: MetaWizardForm = { ...empty, profileId: "chartlens" }
    expect(step1.validate?.(filled)).toBeNull()
  })
})
