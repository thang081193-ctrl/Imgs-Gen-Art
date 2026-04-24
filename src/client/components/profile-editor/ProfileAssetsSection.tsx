// Session #30 Step 4 — Assets section. Owns upload/delete network workflow
// separately from the main form's Save button because the server mutates
// the profile on upload (POST /:id/upload-asset → touchUpdatedAt). Caller
// passes profileId + current DTO assets + an onChanged hook that refetches.
//
// Create mode (profileId === null): renders a placeholder prompting Save
// first, since the upload endpoint needs an existing id.

import { useRef } from "react"
import type { ReactElement } from "react"
import type { ProfileDto } from "@/core/dto/profile-dto"
import { apiPut } from "@/client/api/client"
import type { ShowToast } from "@/client/components/ToastHost"
import { AssetSlot } from "./AssetSlot"
import {
  ACCEPTED_MIME,
  extractAssetIds,
  labelFor,
  parseAssetId,
  removeAssetReference,
  safeJson,
  type UploadKind,
} from "./asset-url-helpers"

export interface ProfileAssetsSectionProps {
  profileId: string | null
  assets: ProfileDto["assets"] | null
  version: number
  showToast: ShowToast
  onChanged: () => void
}

export function ProfileAssetsSection({
  profileId,
  assets,
  version,
  showToast,
  onChanged,
}: ProfileAssetsSectionProps): ReactElement {
  if (profileId === null || assets === null) {
    return (
      <section className="space-y-3 rounded-md border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-100">Assets</h2>
        <p className="text-xs text-slate-500">
          Save the profile first — uploads bind to an existing profile id.
        </p>
      </section>
    )
  }

  const currentIds = extractAssetIds(assets)

  const uploadFile = async (kind: UploadKind, file: File): Promise<void> => {
    const fd = new FormData()
    fd.append("kind", kind)
    fd.append("expectedVersion", String(version))
    fd.append("file", file, file.name)
    try {
      const res = await fetch(`/api/profiles/${profileId}/upload-asset`, {
        method: "POST",
        body: fd,
      })
      if (!res.ok) {
        const body = await safeJson(res)
        throw new Error(typeof body?.["message"] === "string"
          ? (body["message"] as string)
          : `HTTP ${res.status}`)
      }
      showToast({ variant: "success", message: `${labelFor(kind)} uploaded.` })
      onChanged()
    } catch (err) {
      showToast({
        variant: "danger",
        message: `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  const removeAsset = async (kind: UploadKind, assetId: string): Promise<void> => {
    try {
      const del = await fetch(`/api/profile-assets/${assetId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      })
      if (del.status !== 204 && !del.ok) throw new Error(`HTTP ${del.status}`)
      const nextAssets = removeAssetReference(currentIds, kind, assetId)
      await apiPut(`/api/profiles/${profileId}`, {
        expectedVersion: version,
        assets: nextAssets,
      })
      showToast({ variant: "success", message: `${labelFor(kind)} removed.` })
      onChanged()
    } catch (err) {
      showToast({
        variant: "danger",
        message: `Remove failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="text-sm font-semibold text-slate-100">Assets</h2>

      <AssetSlot
        label="App logo"
        url={assets.appLogoUrl}
        onUpload={(f) => { void uploadFile("logo", f) }}
        onRemove={
          currentIds.appLogoAssetId !== null
            ? () => { void removeAsset("logo", currentIds.appLogoAssetId!) }
            : null
        }
      />

      <AssetSlot
        label="Store badge"
        url={assets.storeBadgeUrl}
        onUpload={(f) => { void uploadFile("badge", f) }}
        onRemove={
          currentIds.storeBadgeAssetId !== null
            ? () => { void removeAsset("badge", currentIds.storeBadgeAssetId!) }
            : null
        }
      />

      <ScreenshotGrid
        urls={assets.screenshotUrls}
        onUpload={(f) => { void uploadFile("screenshot", f) }}
        onRemove={(id) => { void removeAsset("screenshot", id) }}
      />
    </section>
  )
}

function ScreenshotGrid({
  urls,
  onUpload,
  onRemove,
}: {
  urls: string[]
  onUpload: (file: File) => void
  onRemove: (id: string) => void
}): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">Screenshots</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
        >
          + Add screenshot
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
            if (inputRef.current) inputRef.current.value = ""
          }}
          className="hidden"
        />
      </div>
      {urls.length === 0 ? (
        <p className="text-xs text-slate-500">No screenshots uploaded yet.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {urls.map((url, idx) => {
            const id = parseAssetId(url)
            return (
              <li key={url} className="relative">
                <img
                  src={url}
                  alt={`Screenshot ${idx + 1}`}
                  className="h-28 w-full rounded border border-slate-700 object-cover"
                />
                {id !== null && (
                  <button
                    type="button"
                    onClick={() => onRemove(id)}
                    className="absolute right-1 top-1 rounded bg-slate-950/80 px-2 py-0.5 text-xs text-slate-200 hover:bg-red-900"
                    aria-label="Remove screenshot"
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
