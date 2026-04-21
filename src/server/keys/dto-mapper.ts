// Rule 11 enforcement: convert domain KeySlot/VertexSlot → client-safe DTOs.
// Strips keyEncrypted (secret) and serviceAccountPath (filesystem). Existence
// of the Vertex credentials file is exposed as a boolean only.

import { existsSync } from "node:fs"
import type { KeySlotDto, VertexSlotDto } from "@/core/dto/key-dto"
import type { KeySlot, VertexSlot } from "./types"

export function toKeySlotDto(slot: KeySlot): KeySlotDto {
  const dto: KeySlotDto = {
    id: slot.id,
    label: slot.label,
    addedAt: slot.addedAt,
  }
  if (slot.lastUsedAt) dto.lastUsedAt = slot.lastUsedAt
  return dto
}

export function toVertexSlotDto(slot: VertexSlot): VertexSlotDto {
  const dto: VertexSlotDto = {
    id: slot.id,
    label: slot.label,
    projectId: slot.projectId,
    location: slot.location,
    hasCredentials: existsSync(slot.serviceAccountPath),
    addedAt: slot.addedAt,
  }
  if (slot.lastUsedAt) dto.lastUsedAt = slot.lastUsedAt
  return dto
}
