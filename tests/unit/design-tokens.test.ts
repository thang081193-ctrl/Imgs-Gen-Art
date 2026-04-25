// Asserts CONTRIBUTING Rule 1: no interpolation in class strings,
// and that every WORKFLOW_COLORS / SEMANTIC_COLORS value has a COLOR_CLASSES entry with all 5 fields.

import { describe, expect, it } from "vitest"
import { COLOR_CLASSES, SEMANTIC_COLORS, WORKFLOW_COLORS } from "@/core/design/tokens"

const REQUIRED_FIELDS = ["active", "inactive", "glow", "badge", "text"] as const

describe("design-tokens: literal class strings (Rule 1)", () => {
  it("no ${ interpolation in any COLOR_CLASSES value", () => {
    for (const [variant, classes] of Object.entries(COLOR_CLASSES)) {
      for (const [field, value] of Object.entries(classes)) {
        expect(value, `${variant}.${field}`).not.toContain("${")
      }
    }
  })

  it("every ColorVariantClasses has all 5 required fields filled", () => {
    for (const [variant, classes] of Object.entries(COLOR_CLASSES)) {
      for (const field of REQUIRED_FIELDS) {
        const value = (classes as Record<string, string>)[field]
        expect(value, `${variant}.${field}`).toBeTruthy()
        expect(typeof value).toBe("string")
      }
    }
  })
})

describe("design-tokens: mapping integrity", () => {
  it("every WORKFLOW_COLORS value has a COLOR_CLASSES key", () => {
    for (const [workflowId, color] of Object.entries(WORKFLOW_COLORS)) {
      expect(COLOR_CLASSES, `missing color ${color} for workflow ${workflowId}`).toHaveProperty(color)
    }
  })

  it("every SEMANTIC_COLORS value has a COLOR_CLASSES key", () => {
    for (const [role, color] of Object.entries(SEMANTIC_COLORS)) {
      expect(COLOR_CLASSES, `missing color ${color} for semantic role ${role}`).toHaveProperty(color)
    }
  })

  it("exactly 10 color variants in COLOR_CLASSES", () => {
    expect(Object.keys(COLOR_CLASSES)).toHaveLength(10)
  })

  it("exactly 5 workflows mapped (S#44 Phase E adds google-ads)", () => {
    expect(Object.keys(WORKFLOW_COLORS)).toHaveLength(5)
  })
})
