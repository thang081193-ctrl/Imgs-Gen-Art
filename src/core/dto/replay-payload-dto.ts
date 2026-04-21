// Plan §6.4 — ReplayPayloadDto. profileSnapshot is DTO (paths already mapped to URLs).

import type { ProfileDto } from "./profile-dto"

export interface ReplayPayloadDto {
  version: 1
  prompt: string
  providerId: string
  modelId: string
  aspectRatio: string
  language?: string
  seed?: number
  providerSpecificParams: Record<string, unknown>
  promptTemplateId: string
  promptTemplateVersion: string
  contextSnapshot: {
    profileId: string
    profileVersion: number
    profileSnapshot: ProfileDto
  }
}
