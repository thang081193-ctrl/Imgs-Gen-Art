// Pure snapshot transforms over StoredKeys. No I/O; caller composes
// load → transform → save. Keeps storage (store.ts) and action (this)
// separated per CONTRIBUTING §3.

import { shortId } from "@/core/shared/id"
import { encrypt } from "./crypto"
import type { KeySlot, StoredKeys, VertexSlot } from "./types"

export type ProviderId = "gemini" | "vertex"

export function listGeminiSlots(store: StoredKeys): KeySlot[] {
  return store.gemini.slots
}

export function listVertexSlots(store: StoredKeys): VertexSlot[] {
  return store.vertex.slots
}

export interface AddGeminiInput { label: string; plaintextKey: string }
export interface AddVertexInput {
  label: string
  projectId: string
  location: string
  serviceAccountPath: string
}

export function addGeminiSlot(
  store: StoredKeys,
  input: AddGeminiInput,
): { next: StoredKeys; slotId: string } {
  const id = shortId("ks", 10)
  const slot: KeySlot = {
    id,
    label: input.label,
    keyEncrypted: encrypt(input.plaintextKey),
    addedAt: new Date().toISOString(),
  }
  const next: StoredKeys = {
    ...store,
    gemini: {
      activeSlotId: store.gemini.activeSlotId ?? id, // first slot auto-activates
      slots: [...store.gemini.slots, slot],
    },
  }
  return { next, slotId: id }
}

export function addVertexSlot(
  store: StoredKeys,
  input: AddVertexInput,
): { next: StoredKeys; slotId: string } {
  const id = shortId("vs", 10)
  const slot: VertexSlot = {
    id,
    label: input.label,
    projectId: input.projectId,
    location: input.location,
    serviceAccountPath: input.serviceAccountPath,
    addedAt: new Date().toISOString(),
  }
  const next: StoredKeys = {
    ...store,
    vertex: {
      activeSlotId: store.vertex.activeSlotId ?? id,
      slots: [...store.vertex.slots, slot],
    },
  }
  return { next, slotId: id }
}

export function activateSlot(store: StoredKeys, provider: ProviderId, slotId: string): StoredKeys {
  if (provider === "gemini") {
    if (!store.gemini.slots.some((s) => s.id === slotId)) {
      throw new Error(`Slot not found: gemini/${slotId}`)
    }
    return { ...store, gemini: { ...store.gemini, activeSlotId: slotId } }
  }
  if (!store.vertex.slots.some((s) => s.id === slotId)) {
    throw new Error(`Slot not found: vertex/${slotId}`)
  }
  return { ...store, vertex: { ...store.vertex, activeSlotId: slotId } }
}

export function removeSlot(store: StoredKeys, provider: ProviderId, slotId: string): StoredKeys {
  if (provider === "gemini") {
    const slots = store.gemini.slots.filter((s) => s.id !== slotId)
    const activeSlotId =
      store.gemini.activeSlotId === slotId ? (slots[0]?.id ?? null) : store.gemini.activeSlotId
    return { ...store, gemini: { activeSlotId, slots } }
  }
  const slots = store.vertex.slots.filter((s) => s.id !== slotId)
  const activeSlotId =
    store.vertex.activeSlotId === slotId ? (slots[0]?.id ?? null) : store.vertex.activeSlotId
  return { ...store, vertex: { activeSlotId, slots } }
}
