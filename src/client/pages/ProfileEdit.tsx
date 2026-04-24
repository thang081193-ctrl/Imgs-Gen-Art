// Session #30 Step 4 — Profile CMS editor page. Dedicated page (Q-30.A
// confirmed). Two modes driven by navigator.params:
//
//   - Create: profileId === undefined. May include `initialProfile` from the
//     Profiles list duplicate flow (Q-30.C clone-to-draft).
//   - Edit: profileId set → fetch via useProfileDetail.
//
// Form state covers identity + visual + positioning + context. Assets are
// owned by ProfileAssetsSection (out-of-band: upload/delete hit the server
// directly → editor refetches profile to re-sync).
//
// Unsaved-changes guard: dirty state registers a window.confirm guard on
// the navigator + a beforeunload handler. Both unmount on clean state.
//
// F1 simplified: 409 VERSION_CONFLICT is unreachable under v1 schema but we
// still wire it — toast + refetch + reset form to server state.

import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import type { Navigator } from "@/client/navigator"
import { ApiError } from "@/client/api/client"
import {
  createProfile,
  describeSaveFailure,
  updateProfile,
  useProfileDetail,
} from "@/client/api/profile-hooks"
import type { ShowToast } from "@/client/components/ToastHost"
import { ProfileAssetsSection } from "@/client/components/profile-editor/ProfileAssetsSection"
import { ProfileContextSection } from "@/client/components/profile-editor/ProfileContextSection"
import { ProfileIdentitySection } from "@/client/components/profile-editor/ProfileIdentitySection"
import { ProfilePositioningSection } from "@/client/components/profile-editor/ProfilePositioningSection"
import { ProfileVisualSection } from "@/client/components/profile-editor/ProfileVisualSection"
import {
  BLANK_PROFILE,
  buildCreateInput,
  buildUpdateInput,
  sliceFromCreateInput,
  sliceFromDto,
  slicesEqual,
  type EditableSlice,
} from "./profile-edit-helpers"

export interface ProfileEditProps {
  navigator: Navigator
  showToast: ShowToast
}

export function ProfileEdit({
  navigator,
  showToast,
}: ProfileEditProps): ReactElement {
  const profileId = navigator.params.profileId ?? null
  const initialProfileParam = navigator.params.initialProfile ?? null
  const isCreateMode = profileId === null

  const [refreshKey, setRefreshKey] = useState(0)
  const detail = useProfileDetail(profileId, refreshKey)

  const [form, setForm] = useState<EditableSlice | null>(null)
  const [initial, setInitial] = useState<EditableSlice | null>(null)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  // Initialize form for create mode (uses initialProfile if present for the
  // duplicate flow, otherwise the blank template). Runs once per mount.
  useEffect(() => {
    if (!isCreateMode) return
    if (form !== null) return
    const source = initialProfileParam ?? BLANK_PROFILE
    const slice = sliceFromCreateInput(source)
    setForm(slice)
    setInitial(slice)
  }, [isCreateMode, initialProfileParam, form])

  // Initialize / re-initialize form for edit mode on fetch + refresh.
  useEffect(() => {
    if (isCreateMode) return
    if (detail.data === null) return
    const slice = sliceFromDto(detail.data)
    setForm(slice)
    setInitial(slice)
  }, [isCreateMode, detail.data])

  const isDirty =
    form !== null && initial !== null && !slicesEqual(form, initial)

  // In-app navigation guard.
  useEffect(() => {
    if (!isDirty) return undefined
    navigator.registerGuard(() =>
      window.confirm("Discard unsaved changes?"),
    )
    return () => navigator.unregisterGuard()
  }, [isDirty, navigator])

  // Tab close / reload guard.
  useEffect(() => {
    if (!isDirty) return undefined
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])

  const patch = (slicePatch: Partial<EditableSlice>): void => {
    setForm((prev) => (prev === null ? prev : { ...prev, ...slicePatch }))
  }

  const handleSave = async (): Promise<void> => {
    if (form === null) return
    if (form.name.trim() === "") {
      setNameError("Name is required.")
      return
    }
    setNameError(null)
    setSaving(true)
    try {
      if (isCreateMode) {
        const created = await createProfile(buildCreateInput(form))
        showToast({ variant: "success", message: `Profile "${created.name}" created.` })
        setInitial(form)
        navigator.unregisterGuard()
        navigator.go("profile-edit", { profileId: created.id })
      } else {
        const version = detail.data?.version ?? 1
        const updated = await updateProfile(profileId!, buildUpdateInput(form, version))
        showToast({ variant: "success", message: "Profile saved." })
        const slice = sliceFromDto(updated)
        setForm(slice)
        setInitial(slice)
      }
    } catch (err) {
      showToast(describeSaveFailure(err))
      if (err instanceof ApiError && err.status === 409 && !isCreateMode) {
        setRefreshKey((k) => k + 1)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = (): void => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) return
    navigator.unregisterGuard()
    navigator.go("profiles")
  }

  if (!isCreateMode && detail.loading) {
    return <PageShell><p className="text-sm text-slate-400">Loading…</p></PageShell>
  }
  if (!isCreateMode && detail.error !== null) {
    return (
      <PageShell>
        <div className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Failed to load profile: {detail.error.message}
        </div>
      </PageShell>
    )
  }
  if (form === null) {
    return <PageShell><p className="text-sm text-slate-400">Loading…</p></PageShell>
  }

  const title = isCreateMode ? "New profile" : `Edit — ${form.name || "(untitled)"}`
  // Save semantics differ by mode: create always commits (even a clone-
  // to-draft prefill the user doesn't tweak), edit requires a dirty form
  // to avoid no-op PUTs. Both modes still gate on a non-empty name.
  const canSave =
    form.name.trim() !== "" && !saving && (isCreateMode || isDirty)

  return (
    <PageShell>
      <header className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={handleCancel}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            ← Profiles
          </button>
          <h1 className="text-2xl font-semibold text-slate-100">{title}</h1>
          {isDirty && !isCreateMode && (
            <p className="text-xs text-amber-400">Unsaved changes.</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="rounded border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void handleSave() }}
            disabled={!canSave}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <ProfileIdentitySection
        value={{ name: form.name, tagline: form.tagline, category: form.category }}
        onChange={patch}
        nameError={nameError}
      />

      <ProfileAssetsSection
        profileId={profileId}
        assets={detail.data?.assets ?? null}
        version={detail.data?.version ?? 1}
        showToast={showToast}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />

      <ProfileVisualSection
        value={form.visual}
        onChange={(v) => patch({ visual: { ...form.visual, ...v } })}
      />

      <ProfilePositioningSection
        value={form.positioning}
        onChange={(p) => patch({ positioning: { ...form.positioning, ...p } })}
      />

      <ProfileContextSection
        value={form.context}
        onChange={(c) => patch({ context: { ...form.context, ...c } })}
      />
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      {children}
    </main>
  )
}
