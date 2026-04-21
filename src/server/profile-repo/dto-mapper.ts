// Rule 11 — profile-repo exposes storage shape (with asset IDs) to the
// server only; the route layer maps to ProfileDto / ProfileSummaryDto,
// resolving asset IDs to opaque URL routes. No filesystem paths ever.

import type { AppProfile } from "@/core/schemas/app-profile"
import type { ProfileDto, ProfileSummaryDto } from "@/core/dto/profile-dto"

function assetIdToUrl(id: string | null): string | null {
  return id ? `/api/profile-assets/${id}/file` : null
}

export function toProfileDto(profile: AppProfile): ProfileDto {
  return {
    id: profile.id,
    name: profile.name,
    tagline: profile.tagline,
    category: profile.category,
    version: profile.version,
    assets: {
      appLogoUrl: assetIdToUrl(profile.assets.appLogoAssetId),
      storeBadgeUrl: assetIdToUrl(profile.assets.storeBadgeAssetId),
      screenshotUrls: profile.assets.screenshotAssetIds.map(
        (id) => `/api/profile-assets/${id}/file`,
      ),
    },
    visual: profile.visual,
    positioning: profile.positioning,
    context: profile.context,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }
}

export function toProfileSummaryDto(profile: AppProfile): ProfileSummaryDto {
  return {
    id: profile.id,
    name: profile.name,
    tagline: profile.tagline,
    category: profile.category,
    version: profile.version,
    logoUrl: assetIdToUrl(profile.assets.appLogoAssetId),
    updatedAt: profile.updatedAt,
  }
}
