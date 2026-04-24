// Session #30 Step 4 — URL ↔ asset-id helpers shared by ProfileAssetsSection
// and AssetSlot. The ProfileDto exposes assets as
// `/api/profile-assets/{id}/file` URLs (dto-mapper.ts) and the PUT
// /api/profiles/:id payload wants raw asset IDs, so the editor parses the
// URL on the client. Shape is a client-trusted invariant — same precedent
// as src/client/workflows/style-transform.tsx.

import type { ProfileDto } from "@/core/dto/profile-dto"

export type UploadKind = "logo" | "badge" | "screenshot"

export interface AssetIds {
  appLogoAssetId: string | null
  storeBadgeAssetId: string | null
  screenshotAssetIds: string[]
}

const URL_PATTERN = /^\/api\/profile-assets\/([^/]+)\/file$/
export const ACCEPTED_MIME = "image/png,image/jpeg,image/webp"

export function parseAssetId(url: string | null): string | null {
  if (url === null) return null
  const m = URL_PATTERN.exec(url)
  return m !== null ? (m[1] ?? null) : null
}

export function extractAssetIds(assets: ProfileDto["assets"]): AssetIds {
  return {
    appLogoAssetId: parseAssetId(assets.appLogoUrl),
    storeBadgeAssetId: parseAssetId(assets.storeBadgeUrl),
    screenshotAssetIds: assets.screenshotUrls
      .map(parseAssetId)
      .filter((id): id is string => id !== null),
  }
}

export function removeAssetReference(
  current: AssetIds,
  kind: UploadKind,
  removedId: string,
): AssetIds {
  if (kind === "logo") return { ...current, appLogoAssetId: null }
  if (kind === "badge") return { ...current, storeBadgeAssetId: null }
  return {
    ...current,
    screenshotAssetIds: current.screenshotAssetIds.filter((id) => id !== removedId),
  }
}

export function labelFor(kind: UploadKind): string {
  if (kind === "logo") return "Logo"
  if (kind === "badge") return "Badge"
  return "Screenshot"
}

export async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("application/json")) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}
