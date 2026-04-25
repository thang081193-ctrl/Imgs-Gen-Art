// Session #30 Step 4 — Profile CMS list page. 5-column table (F2 verdict):
//   logo thumb (initials fallback) | name + tagline | category |
//   updatedAt relative | row actions (edit / duplicate / export / delete).
//
// Duplicate flow (Q-30.C): client-side clone via cloneProfileToDraft, then
// navigate to profile-edit create mode with the clone in navigator params.
// Export flow (F4): client-side wrap using the list row's ProfileSummary
// fetches the full DTO via GET /api/profiles/:id before wrapping.

import { useState } from "react"
import type { ReactElement } from "react"
import type { Navigator } from "@/client/navigator"
import { apiGet, ApiError } from "@/client/api/client"
import type { ProfileCategory, ProfileDto, ProfileSummaryDto } from "@/core/dto/profile-dto"
import {
  cloneProfileToDraft,
  exportProfileToFile,
  useProfilesList,
} from "@/client/api/profile-hooks"
import { DeleteProfileDialog } from "@/client/components/profile-editor/DeleteProfileDialog"
import type { ShowToast } from "@/client/components/ToastHost"
import { formatRelative, hueFor, initialsFor } from "@/client/utils/profile-list"
import { useActiveProfileId } from "@/client/utils/active-profile"

const CATEGORY_LABEL: Record<ProfileCategory, string> = {
  utility: "Utility",
  lifestyle: "Lifestyle",
  productivity: "Productivity",
  entertainment: "Entertainment",
  education: "Education",
}

export interface ProfilesProps {
  navigator: Navigator
  showToast: ShowToast
}

export function Profiles({ navigator, showToast }: ProfilesProps): ReactElement {
  const [refreshKey, setRefreshKey] = useState(0)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  const list = useProfilesList(refreshKey)
  const [activeId, setActiveId] = useActiveProfileId()

  const handleSetActive = (summary: ProfileSummaryDto): void => {
    if (activeId === summary.id) {
      setActiveId(null)
      showToast({ variant: "info", message: `Cleared active profile.` })
    } else {
      setActiveId(summary.id)
      showToast({ variant: "success", message: `${summary.name} is now the active profile.` })
    }
  }

  const bump = (): void => setRefreshKey((k) => k + 1)

  const handleDuplicate = async (summary: ProfileSummaryDto): Promise<void> => {
    try {
      const full = await apiGet<ProfileDto>(`/api/profiles/${summary.id}`)
      const draft = cloneProfileToDraft(full)
      navigator.go("profile-edit", { initialProfile: draft })
    } catch (err) {
      showToast({
        variant: "danger",
        message: `Failed to prepare duplicate: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  const handleExport = async (summary: ProfileSummaryDto): Promise<void> => {
    try {
      const full = await apiGet<ProfileDto>(`/api/profiles/${summary.id}`)
      exportProfileToFile(full)
      showToast({ variant: "success", message: `Exported ${summary.name}.` })
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err)
      showToast({ variant: "danger", message: `Export failed: ${msg}` })
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Profiles</h1>
          <p className="text-sm text-slate-400">
            App profiles that drive prompt personalization across workflows.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigator.go("profile-edit", {})}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          + New profile
        </button>
      </header>

      {list.loading && (
        <div className="rounded border border-slate-800 bg-slate-900 px-4 py-6 text-sm text-slate-400">
          Loading profiles…
        </div>
      )}

      {list.error !== null && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Failed to load profiles: {list.error.message}
        </div>
      )}

      {list.data !== null && list.data.profiles.length === 0 && (
        <div className="rounded border border-slate-800 bg-slate-900 px-4 py-8 text-center text-sm text-slate-400">
          <p>No profiles yet.</p>
          <button
            type="button"
            onClick={() => navigator.go("profile-edit", {})}
            className="mt-3 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Create your first profile
          </button>
        </div>
      )}

      {list.data !== null && list.data.profiles.length > 0 && (
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-14 px-3 py-2 text-left"></th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="w-44 px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.data.profiles.map((p) => (
                <tr key={p.id} className="border-t border-slate-800 hover:bg-slate-900/60">
                  <td className="px-3 py-2">
                    <LogoBadge name={p.name} logoUrl={p.logoUrl} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => navigator.go("profile-edit", { profileId: p.id })}
                      className="text-left font-medium text-slate-100 hover:text-indigo-300"
                    >
                      {p.name}
                    </button>
                    {p.tagline !== "" && (
                      <p className="text-xs text-slate-500">{p.tagline}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {CATEGORY_LABEL[p.category]}
                  </td>
                  <td
                    className="px-3 py-2 text-slate-400"
                    title={new Date(p.updatedAt).toLocaleString()}
                  >
                    {formatRelative(p.updatedAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <IconButton
                        label={activeId === p.id ? "Clear active" : "Set active"}
                        active={activeId === p.id}
                        onClick={() => handleSetActive(p)}
                        testId={`profile-set-active-${p.id}`}
                      >
                        ★
                      </IconButton>
                      <IconButton
                        label="Edit"
                        onClick={() => navigator.go("profile-edit", { profileId: p.id })}
                      >
                        ✎
                      </IconButton>
                      <IconButton
                        label="Duplicate"
                        onClick={() => { void handleDuplicate(p) }}
                      >
                        ⎘
                      </IconButton>
                      <IconButton
                        label="Export"
                        onClick={() => { void handleExport(p) }}
                      >
                        ↓
                      </IconButton>
                      <IconButton
                        label="Delete"
                        danger
                        onClick={() => setDeleting({ id: p.id, name: p.name })}
                      >
                        ×
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting !== null && (
        <DeleteProfileDialog
          profileId={deleting.id}
          profileName={deleting.name}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            showToast({ variant: "success", message: `Deleted "${deleting.name}".` })
            setDeleting(null)
            bump()
          }}
          onViewInGallery={(id) => {
            setDeleting(null)
            navigator.go("gallery", { profileIds: [id] })
          }}
        />
      )}
    </main>
  )
}

function LogoBadge({
  name,
  logoUrl,
}: {
  name: string
  logoUrl: string | null
}): ReactElement {
  if (logoUrl !== null) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-6 w-6 rounded object-cover"
      />
    )
  }
  const hue = hueFor(name)
  return (
    <span
      className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold text-slate-900"
      style={{ backgroundColor: `hsl(${hue}, 65%, 70%)` }}
    >
      {initialsFor(name)}
    </span>
  )
}

function IconButton({
  children,
  label,
  onClick,
  danger,
  active,
  testId,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  active?: boolean
  testId?: string
}): ReactElement {
  const base = "h-7 w-7 rounded border text-sm leading-none"
  const palette = danger
    ? "border-red-900/40 bg-red-950/30 text-red-300 hover:bg-red-900/40"
    : active === true
    ? "border-amber-500/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
    : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`${base} ${palette}`}
      {...(testId !== undefined ? { "data-testid": testId } : {})}
    >
      {children}
    </button>
  )
}
