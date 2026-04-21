// Plan §5.2 + §6.4 — ProfileDto (what client sees). Never contains file paths.

export type ProfileCategory = "utility" | "lifestyle" | "productivity" | "entertainment" | "education"
export type ProfileTone = "minimal" | "bold" | "playful" | "elegant" | "technical" | "warm"
export type ProfileMarketTier = "tier1" | "tier2" | "tier3" | "global"

export interface ProfileVisualDto {
  primaryColor: string
  secondaryColor: string
  accentColor: string
  tone: ProfileTone
  doList: string[]
  dontList: string[]
}

export interface ProfilePositioningDto {
  usp: string
  targetPersona: string
  marketTier: ProfileMarketTier
  competitors?: string[]
}

export interface ProfileContextDto {
  features: string[]
  keyScenarios: string[]
  forbiddenContent: string[]
}

export interface ProfileDto {
  id: string
  name: string
  tagline: string
  category: ProfileCategory
  version: number
  assets: {
    appLogoUrl: string | null
    storeBadgeUrl: string | null
    screenshotUrls: string[]
  }
  visual: ProfileVisualDto
  positioning: ProfilePositioningDto
  context: ProfileContextDto
  createdAt: string
  updatedAt: string
}

export interface ProfileSummaryDto {
  id: string
  name: string
  tagline: string
  category: ProfileCategory
  version: number
  logoUrl: string | null
  updatedAt: string
}

export interface ProfileCreateInput {
  id?: string
  name: string
  tagline: string
  category: ProfileCategory
  assets?: {
    appLogoAssetId?: string | null
    storeBadgeAssetId?: string | null
    screenshotAssetIds?: string[]
  }
  visual: ProfileVisualDto
  positioning: ProfilePositioningDto
  context: ProfileContextDto
}

export interface ProfileUpdateInput {
  expectedVersion: number
  name?: string
  tagline?: string
  category?: ProfileCategory
  assets?: ProfileCreateInput["assets"]
  visual?: Partial<ProfileVisualDto>
  positioning?: Partial<ProfilePositioningDto>
  context?: Partial<ProfileContextDto>
}
