// Session #30 Step 4 F6 — delete confirm + PROFILE_HAS_ASSETS error state.
//
// Flow:
//   1. Click Delete on a row → dialog opens in "confirm" state.
//   2. Click Confirm → dialog enters "busy" state, fires DELETE.
//   3a. On success → close + refresh list via onDeleted().
//   3b. On 409 PROFILE_HAS_ASSETS → dialog transforms to "blocked" state
//       with asset count + "View in Gallery" CTA that navigates to
//       /gallery filtered by the profileId.
//   3c. On other error → dialog stays "confirm" + inline error banner.

import { useState } from "react"
import type { ReactElement } from "react"
import { deleteProfile } from "@/client/api/profile-hooks"

export interface DeleteProfileDialogProps {
  profileId: string
  profileName: string
  onClose: () => void
  onDeleted: () => void
  onViewInGallery: (profileId: string) => void
}

type State =
  | { kind: "confirm"; error: string | null }
  | { kind: "busy" }
  | { kind: "blocked"; assetCount: number; message: string }

export function DeleteProfileDialog({
  profileId,
  profileName,
  onClose,
  onDeleted,
  onViewInGallery,
}: DeleteProfileDialogProps): ReactElement {
  const [state, setState] = useState<State>({ kind: "confirm", error: null })

  const handleConfirm = async (): Promise<void> => {
    setState({ kind: "busy" })
    const result = await deleteProfile(profileId)
    if (result.ok) {
      onDeleted()
      return
    }
    if (result.kind === "has_assets") {
      setState({
        kind: "blocked",
        assetCount: result.assetCount,
        message: result.message,
      })
      return
    }
    setState({ kind: "confirm", error: result.message })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70">
      <div className="mx-4 w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-xl">
        {state.kind === "blocked" ? (
          <BlockedBody
            profileName={profileName}
            assetCount={state.assetCount}
            onViewInGallery={() => onViewInGallery(profileId)}
            onClose={onClose}
          />
        ) : (
          <ConfirmBody
            profileName={profileName}
            busy={state.kind === "busy"}
            error={state.kind === "confirm" ? state.error : null}
            onConfirm={() => { void handleConfirm() }}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

function ConfirmBody({
  profileName,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  profileName: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}): ReactElement {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-100">Delete profile</h2>
      <p className="text-sm text-slate-300">
        Permanently delete <span className="font-medium text-slate-100">{profileName}</span>?
        This can't be undone.
      </p>
      {error !== null && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  )
}

function BlockedBody({
  profileName,
  assetCount,
  onViewInGallery,
  onClose,
}: {
  profileName: string
  assetCount: number
  onViewInGallery: () => void
  onClose: () => void
}): ReactElement {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-amber-200">Cannot delete</h2>
      <p className="text-sm text-slate-300">
        <span className="font-medium text-slate-100">{profileName}</span> has{" "}
        <span className="font-medium text-slate-100">{assetCount}</span>{" "}
        asset{assetCount === 1 ? "" : "s"}. Delete them from Gallery first.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onViewInGallery}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          View in Gallery
        </button>
      </div>
    </div>
  )
}
