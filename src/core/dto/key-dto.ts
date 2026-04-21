// Plan §6.4 — KeySlotDto + VertexSlotDto. Never expose keyEncrypted or serviceAccountPath.

export interface KeySlotDto {
  id: string
  label: string
  addedAt: string
  lastUsedAt?: string
}

export interface VertexSlotDto {
  id: string
  label: string
  projectId: string
  location: string
  hasCredentials: boolean
  addedAt: string
  lastUsedAt?: string
}
