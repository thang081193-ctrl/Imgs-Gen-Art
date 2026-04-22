// Session #14 pre-patch insurance — pins removeSlot semantics for the
// Q7 policy change: deleting the active slot sets activeSlotId = null
// (NOT auto-activate next). No slot-manager tests existed before; this
// file is the regression guard for the 4-LOC slot-manager.ts diff.

import { describe, expect, it } from "vitest"

import {
  addGeminiSlot,
  addVertexSlot,
  removeSlot,
} from "@/server/keys/slot-manager"
import { EMPTY_STORE, type StoredKeys } from "@/server/keys/types"

function seedGemini(labels: string[]): { store: StoredKeys; slotIds: string[] } {
  let store: StoredKeys = EMPTY_STORE
  const slotIds: string[] = []
  for (const label of labels) {
    const result = addGeminiSlot(store, { label, plaintextKey: `k-${label}` })
    store = result.next
    slotIds.push(result.slotId)
  }
  return { store, slotIds }
}

describe("slot-manager — addGeminiSlot", () => {
  it("first slot auto-activates", () => {
    const { store, slotIds } = seedGemini(["primary"])
    expect(store.gemini.activeSlotId).toBe(slotIds[0])
    expect(store.gemini.slots).toHaveLength(1)
  })

  it("second slot does NOT steal active status", () => {
    const { store, slotIds } = seedGemini(["primary", "backup"])
    expect(store.gemini.activeSlotId).toBe(slotIds[0])
    expect(store.gemini.slots).toHaveLength(2)
  })
})

describe("slot-manager — removeSlot (Q7 semantics)", () => {
  it("removing a non-active slot leaves activeSlotId unchanged", () => {
    const { store, slotIds } = seedGemini(["primary", "backup"])
    const next = removeSlot(store, "gemini", slotIds[1] as string)
    expect(next.gemini.activeSlotId).toBe(slotIds[0])
    expect(next.gemini.slots).toHaveLength(1)
    expect(next.gemini.slots[0]?.id).toBe(slotIds[0])
  })

  it("removing the active slot sets activeSlotId = null (Q7: no auto-activate-next)", () => {
    const { store, slotIds } = seedGemini(["primary", "backup"])
    const next = removeSlot(store, "gemini", slotIds[0] as string)
    expect(next.gemini.activeSlotId).toBeNull()
    expect(next.gemini.slots).toHaveLength(1)
    expect(next.gemini.slots[0]?.id).toBe(slotIds[1])
  })

  it("removing the only slot sets activeSlotId = null", () => {
    const { store, slotIds } = seedGemini(["only"])
    const next = removeSlot(store, "gemini", slotIds[0] as string)
    expect(next.gemini.activeSlotId).toBeNull()
    expect(next.gemini.slots).toHaveLength(0)
  })

  it("removing an unknown slot is a no-op (idempotent)", () => {
    const { store, slotIds } = seedGemini(["primary"])
    const next = removeSlot(store, "gemini", "ks_ghost")
    expect(next.gemini.activeSlotId).toBe(slotIds[0])
    expect(next.gemini.slots).toHaveLength(1)
  })
})

describe("slot-manager — removeSlot parity for vertex provider", () => {
  it("removing the active vertex slot sets activeSlotId = null", () => {
    const step1 = addVertexSlot(EMPTY_STORE, {
      label: "primary",
      projectId: "proj-a",
      location: "us-central1",
      serviceAccountPath: "/tmp/vertex-a.json",
    })
    const step2 = addVertexSlot(step1.next, {
      label: "backup",
      projectId: "proj-b",
      location: "us-east1",
      serviceAccountPath: "/tmp/vertex-b.json",
    })
    const next = removeSlot(step2.next, "vertex", step1.slotId)
    expect(next.vertex.activeSlotId).toBeNull()
    expect(next.vertex.slots).toHaveLength(1)
    expect(next.vertex.slots[0]?.id).toBe(step2.slotId)
  })
})
