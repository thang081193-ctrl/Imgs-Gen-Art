// Domain types for encrypted key storage (PLAN §5.5 + §6.4).
// StoredKeys is the on-disk shape of data/keys.enc. Zod-validated on load
// per Rule 14 so schema drift fails fast instead of corrupting silently.

import { z } from "zod"

export const KeySlotSchema = z.object({
  id: z.string(),
  label: z.string(),
  keyEncrypted: z.string(),             // base64(iv || ciphertext || authTag)
  addedAt: z.string(),                  // ISO timestamp
  lastUsedAt: z.string().optional(),
})
export type KeySlot = z.infer<typeof KeySlotSchema>

export const VertexSlotSchema = z.object({
  id: z.string(),
  label: z.string(),
  projectId: z.string(),
  location: z.string(),
  serviceAccountPath: z.string(),       // never leaked to client — DTO strips it
  addedAt: z.string(),
  lastUsedAt: z.string().optional(),
})
export type VertexSlot = z.infer<typeof VertexSlotSchema>

export const StoredKeysSchema = z.object({
  version: z.literal(1),
  gemini: z.object({
    activeSlotId: z.string().nullable(),
    slots: z.array(KeySlotSchema),
  }),
  vertex: z.object({
    activeSlotId: z.string().nullable(),
    slots: z.array(VertexSlotSchema),
  }),
})
export type StoredKeys = z.infer<typeof StoredKeysSchema>

export const EMPTY_STORE: StoredKeys = {
  version: 1,
  gemini: { activeSlotId: null, slots: [] },
  vertex: { activeSlotId: null, slots: [] },
}
