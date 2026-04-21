// Public surface of src/server/keys. Test-only hooks (deriveKeyFor) stay
// importable from "@/server/keys/crypto" but are intentionally not re-exported.

export type { KeySlot, VertexSlot, StoredKeys } from "./types"
export { EMPTY_STORE, StoredKeysSchema, KeySlotSchema, VertexSlotSchema } from "./types"
export { encrypt, decrypt } from "./crypto"
export { loadStoredKeys, resolveDefaultKeysPath, saveStoredKeys } from "./store"
export {
  type ProviderId,
  type AddGeminiInput,
  type AddVertexInput,
  activateSlot,
  addGeminiSlot,
  addVertexSlot,
  listGeminiSlots,
  listVertexSlots,
  removeSlot,
} from "./slot-manager"
export { toKeySlotDto, toVertexSlotDto } from "./dto-mapper"
