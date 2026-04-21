// `freezeProfileForReplay` — deep-clones an AppProfile for embedding into
// a replay payload's contextSnapshot (PLAN §5.4). AppProfile already uses
// asset-ID references (v2.2), so no path-rewriting is required — the clone
// exists purely to prevent later mutation of the live profile from poisoning
// a historical replay payload.

import type { AppProfile } from "@/core/schemas/app-profile"

export function freezeProfileForReplay(profile: AppProfile): AppProfile {
  return structuredClone(profile)
}
