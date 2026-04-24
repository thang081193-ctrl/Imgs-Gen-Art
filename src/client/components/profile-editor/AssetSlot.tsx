// Session #30 Step 4 — single asset thumbnail slot used by logo + badge.
// Screenshots use a simpler list layout inline in ProfileAssetsSection.

import { useRef } from "react"
import type { ChangeEvent, ReactElement } from "react"
import { ACCEPTED_MIME } from "./asset-url-helpers"

export interface AssetSlotProps {
  label: string
  url: string | null
  onUpload: (file: File) => void
  onRemove: (() => void) | null
}

export function AssetSlot({
  label,
  url,
  onUpload,
  onRemove,
}: AssetSlotProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
    if (inputRef.current) inputRef.current.value = ""
  }
  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 overflow-hidden rounded border border-slate-700 bg-slate-900">
        {url !== null && (
          <img src={url} alt={label} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-slate-300">{label}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            {url === null ? "Upload" : "Replace"}
          </button>
          {onRemove !== null && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded border border-red-900/40 bg-red-950/30 px-2 py-1 text-xs text-red-300 hover:bg-red-900/40"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME}
          onChange={handleChange}
          className="hidden"
        />
      </div>
    </div>
  )
}
