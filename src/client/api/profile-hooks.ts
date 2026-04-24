// Session #30 Step 4 / Session #31 Step 6 — Profile CMS mutations + helpers.
//
// Session #31 reopened the F1 preserve-edits flow: v2 schema made 409
// reachable (PUT bumps version on success → second tab's stale
// expectedVersion mismatches). `parseVersionConflict` reads
// `currentVersion` off `ApiError.details` (DECISIONS §F.3.1 augmented
// 409 body); ProfileEdit consumes it to drive the banner state machine.
//
// F4: export uses the already-fetched ProfileDto + GET /api/profiles/:id cache
// in common case; skips backend GET /:id/export to avoid redundant work.
//
// F6: deleteProfile returns a discriminated union so Profiles.tsx can swap a
// confirm dialog into PROFILE_HAS_ASSETS error state with asset count + CTA.
// Raw fetch here (not apiDelete) because the 409 body uses `error` key rather
// than the errorHandler envelope `code` key — see src/server/routes/profiles.ts
// header comment (Session #13 Q1). Pulling the body directly avoids losing
// assetCount through ApiError's type-cast.

import { useEffect, useState } from "react"
import { apiGet, apiPost, apiPut, ApiError } from "./client"
import type {
  ProfileCreateInput,
  ProfileDto,
  ProfileSummaryDto,
  ProfileUpdateInput,
} from "@/core/dto/profile-dto"
import { slugify } from "@/core/shared/id"
import type { ApiState } from "./hooks"

// List with refresh support — mirrors useKeys(refreshKey) pattern. Existing
// useProfiles() stays for read-only callers (Workflow, Gallery); CMS page
// owns the refresh cycle locally.
export function useProfilesList(
  refreshKey: number = 0,
): ApiState<{ profiles: ProfileSummaryDto[] }> {
  const [state, setState] = useState<ApiState<{ profiles: ProfileSummaryDto[] }>>({
    data: null,
    error: null,
    loading: true,
  })
  useEffect(() => {
    const controller = new AbortController()
    setState({ data: null, error: null, loading: true })
    apiGet<{ profiles: ProfileSummaryDto[] }>(`/api/profiles?_=${refreshKey}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return
        setState({ data, error: null, loading: false })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err : new Error(String(err))
        setState({ data: null, error, loading: false })
      })
    return () => {
      controller.abort()
    }
  }, [refreshKey])
  return state
}

// Single-profile fetch with refresh support. Mirrors useProfilesList but for
// the detail endpoint so ProfileEdit can force a refetch after upload/delete
// (assets live server-side of the form) or on a 409 refresh.
export function useProfileDetail(
  id: string | null,
  refreshKey: number = 0,
): ApiState<ProfileDto> {
  const [state, setState] = useState<ApiState<ProfileDto>>({
    data: null,
    error: null,
    loading: id !== null,
  })
  useEffect(() => {
    if (id === null) {
      setState({ data: null, error: null, loading: false })
      return undefined
    }
    const controller = new AbortController()
    setState({ data: null, error: null, loading: true })
    apiGet<ProfileDto>(`/api/profiles/${id}?_=${refreshKey}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return
        setState({ data, error: null, loading: false })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err : new Error(String(err))
        setState({ data: null, error, loading: false })
      })
    return () => {
      controller.abort()
    }
  }, [id, refreshKey])
  return state
}

export function createProfile(input: ProfileCreateInput): Promise<ProfileDto> {
  return apiPost<ProfileDto>("/api/profiles", input)
}

export function updateProfile(id: string, input: ProfileUpdateInput): Promise<ProfileDto> {
  return apiPut<ProfileDto>(`/api/profiles/${id}`, input)
}

export type DeleteProfileResult =
  | { ok: true }
  | { ok: false; kind: "has_assets"; assetCount: number; message: string }
  | { ok: false; kind: "not_found"; message: string }
  | { ok: false; kind: "other"; status: number; message: string }

export async function deleteProfile(id: string): Promise<DeleteProfileResult> {
  const res = await fetch(`/api/profiles/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  })
  if (res.status === 204) return { ok: true }
  const contentType = res.headers.get("content-type") ?? ""
  const body: Record<string, unknown> = contentType.includes("application/json")
    ? ((await res.json()) as Record<string, unknown>)
    : {}
  const msg = readStringField(body, "message")
  if (res.status === 404) {
    return { ok: false, kind: "not_found", message: msg ?? "Profile not found" }
  }
  if (res.status === 409 && body["error"] === "PROFILE_HAS_ASSETS") {
    const assetCount = typeof body["assetCount"] === "number" ? body["assetCount"] : 0
    return {
      ok: false,
      kind: "has_assets",
      assetCount,
      message: msg ?? `Profile has ${assetCount} asset(s)`,
    }
  }
  return {
    ok: false,
    kind: "other",
    status: res.status,
    message: msg ?? `HTTP ${res.status}`,
  }
}

// Clone-to-draft (Q-30.C). Returns a CreateInput prefilled from the source.
// Assets are CLEARED on purpose: profile-asset rows carry a single profileId
// FK, so sharing asset IDs across profiles would break the delete HAS_ASSETS
// guard (it counts rows where profileId === source, not clone). User
// re-uploads the clone's logo/badge/screenshots from the editor.
export function cloneProfileToDraft(source: ProfileDto): ProfileCreateInput {
  return {
    name: `${source.name} (Copy)`,
    tagline: source.tagline,
    category: source.category,
    assets: {
      appLogoAssetId: null,
      storeBadgeAssetId: null,
      screenshotAssetIds: [],
    },
    visual: {
      ...source.visual,
      doList: [...source.visual.doList],
      dontList: [...source.visual.dontList],
    },
    positioning: {
      usp: source.positioning.usp,
      targetPersona: source.positioning.targetPersona,
      marketTier: source.positioning.marketTier,
      ...(source.positioning.competitors
        ? { competitors: [...source.positioning.competitors] }
        : {}),
    },
    context: {
      features: [...source.context.features],
      keyScenarios: [...source.context.keyScenarios],
      forbiddenContent: [...source.context.forbiddenContent],
    },
  }
}

// Client-side export (F4). Wraps ProfileDto in a schemaVersion envelope and
// triggers a `${slugify(name)}.profile.json` download. No backend round-trip.
export interface ProfileExportEnvelope {
  schemaVersion: 1
  profile: ProfileDto
  notes: string
}
const EXPORT_NOTES =
  "Asset IDs reference binary files not included. Re-upload assets after import."

export function exportProfileToFile(profile: ProfileDto): void {
  const envelope: ProfileExportEnvelope = {
    schemaVersion: 1,
    profile,
    notes: EXPORT_NOTES,
  }
  const json = JSON.stringify(envelope, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const filename = `${slugify(profile.name) || profile.id}.profile.json`
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Save-failure → toast message mapper. 409 path intentionally concise:
// ProfileEdit's banner carries the full preserve-edits copy; the toast
// just confirms "we reloaded the remote version and kept your edits."
export interface SaveFailureMessage {
  message: string
  variant: "warning" | "danger"
}

export function describeSaveFailure(err: unknown): SaveFailureMessage {
  if (err instanceof ApiError) {
    if (err.status === 400) {
      return { message: `Validation failed: ${err.message}`, variant: "danger" }
    }
    if (err.status === 404) {
      return { message: "Profile not found", variant: "danger" }
    }
    if (err.status === 409) {
      return {
        message: "Remote updated — reloaded latest, your edits kept.",
        variant: "warning",
      }
    }
    if (err.status >= 500) {
      return { message: "Save failed — try again", variant: "danger" }
    }
    return { message: err.message || "Save failed", variant: "danger" }
  }
  return {
    message: err instanceof Error ? err.message : "Save failed — try again",
    variant: "danger",
  }
}

// DECISIONS §F.3.1 — the 409 body includes `details: {currentVersion,
// expectedVersion}` so `ApiError.details` carries the conflict info.
// Returns null when the error isn't a version-conflict response (or
// when details lost its shape — defensive parse).
export interface VersionConflictInfo {
  currentVersion: number
  expectedVersion: number
}

export function parseVersionConflict(err: unknown): VersionConflictInfo | null {
  if (!(err instanceof ApiError)) return null
  if (err.status !== 409 || err.code !== "VERSION_CONFLICT") return null
  const details = err.details
  if (!details) return null
  const current = details["currentVersion"]
  const expected = details["expectedVersion"]
  if (typeof current !== "number" || typeof expected !== "number") return null
  return { currentVersion: current, expectedVersion: expected }
}

function readStringField(body: Record<string, unknown>, key: string): string | null {
  return typeof body[key] === "string" ? (body[key] as string) : null
}
