// Minimal in-process router. Pages + optional params. No react-router-dom —
// a Page union + setState-backed `go` is enough through Phase 5.
//
// Params stay scoped per navigation; `go()` replaces both page and params.
// Session #30 Step 4 added the "profiles" list + "profile-edit" editor pages
// plus `registerGuard` so the editor can block navigation while dirty (F1
// verdict — unsaved-changes prompt on in-app nav + beforeunload on tab close).

import type { ProfileCreateInput } from "@/core/dto/profile-dto"

export type Page =
  | "home"
  | "workflow"
  | "gallery"
  | "settings"
  | "prompt-lab"
  | "profiles"
  | "profile-edit"
  // S#38 Q-38.J — Home shelf clicks navigate here. Read-only detail
  // (preview + prompt template + lanes + usage count) for both presets
  // and user styles; "Use in wizard" disabled until D1+.
  | "saved-style-detail"
  // S#44 D2/E/F2 — policy-aware wizard routes per lane (X-1 LOCKED).
  // Meta ships in D2; google-ads + play-aso unlock as their phases land.
  | "wizard-meta-ads"
  | "wizard-google-ads"
  | "wizard-play-aso"

export interface NavParams {
  batchId?: string
  assetId?: string
  profileId?: string
  // Duplicate flow (Q-30.C clone-to-draft): Profiles.tsx builds a
  // ProfileCreateInput from the source profile and passes it here so
  // ProfileEdit opens in create mode with the clone prefilled, without
  // any server round-trip. Dropped once the draft is saved.
  initialProfile?: ProfileCreateInput
  // Gallery filter entry (Q-29.E family): Profiles.tsx delete dialog uses
  // this to deep-link "View in Gallery →" when PROFILE_HAS_ASSETS fires.
  profileIds?: string[]
  // S#38 — saved-style-detail page navigation target.
  savedStyleId?: string
}

export type NavGuard = () => boolean

export interface Navigator {
  page: Page
  params: NavParams
  go: (page: Page, params?: NavParams) => void
  registerGuard: (guard: NavGuard) => void
  unregisterGuard: () => void
}
