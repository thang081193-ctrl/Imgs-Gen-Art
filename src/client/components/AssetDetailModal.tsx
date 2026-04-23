// Asset detail modal. Click thumbnail → see full image + metadata +
// "Download" + "Copy ID" + "Filter by batch" affordances. Esc / backdrop
// dismiss. No mutate actions in Phase 3 (delete wired in Phase 5 polish).

import { useEffect } from "react"
import type { ReactElement } from "react"
import type { AssetDto } from "@/core/dto/asset-dto"
import { formatCost } from "@/client/utils/format"

export interface AssetDetailModalProps {
  asset: AssetDto | null
  onClose: () => void
  onFilterBatch: (batchId: string) => void
}

export function AssetDetailModal({
  asset,
  onClose,
  onFilterBatch,
}: AssetDetailModalProps): ReactElement | null {
  useEffect(() => {
    if (asset === null) return undefined
    const h = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [asset, onClose])

  if (asset === null) return null
  const failed = asset.status === "error" || asset.imageUrl === null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-200 font-mono truncate">
              {asset.id}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {asset.workflowId} · {asset.providerId}:{asset.modelId} ·{" "}
              {new Date(asset.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:bg-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            {failed ? (
              <div className="flex aspect-square items-center justify-center rounded-md border border-red-800 bg-red-950/40 text-sm text-red-400 p-4 text-center">
                {asset.errorMessage ?? "generation error"}
              </div>
            ) : (
              <img
                src={asset.imageUrl ?? ""}
                alt={asset.promptRaw}
                className="w-full rounded-md border border-slate-800"
              />
            )}
          </div>
          <dl className="text-xs text-slate-300 space-y-2">
            <Row label="Profile">{asset.profileId} (v{asset.profileVersionAtGen})</Row>
            <Row label="Aspect">{asset.aspectRatio}</Row>
            {asset.language !== null && <Row label="Language">{asset.language}</Row>}
            {asset.batchId !== null && (
              <Row label="Batch">
                <code className="font-mono text-slate-400">{asset.batchId}</code>{" "}
                <button
                  type="button"
                  onClick={() => onFilterBatch(asset.batchId as string)}
                  className="ml-2 underline text-sky-400 hover:text-sky-300"
                >
                  filter →
                </button>
              </Row>
            )}
            {asset.variantGroup !== null && <Row label="Variant">{asset.variantGroup}</Row>}
            {asset.seed !== null && <Row label="Seed">{String(asset.seed)}</Row>}
            <Row label="Size">
              {asset.width ?? "?"}×{asset.height ?? "?"} ·{" "}
              {asset.fileSizeBytes !== null ? `${Math.round(asset.fileSizeBytes / 1024)}KB` : "?"}
            </Row>
            <Row label="Replay class">{asset.replayClass}</Row>
            {asset.generationTimeMs !== null && (
              <Row label="Gen time">{asset.generationTimeMs}ms</Row>
            )}
            {asset.costUsd !== null && (
              <Row label="Cost">{formatCost(asset.costUsd)}</Row>
            )}
            {asset.tags.length > 0 && (
              <Row label="Tags">
                {asset.tags.map((t) => (
                  <span key={t} className="mr-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">{t}</span>
                ))}
              </Row>
            )}
            <Row label="Prompt">
              <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-400 max-h-32 overflow-y-auto">
                {asset.promptRaw}
              </pre>
            </Row>
            <Row label="Actions">
              {asset.imageUrl !== null && (
                <a
                  href={asset.imageUrl}
                  download={`${asset.id}.png`}
                  className="inline-block rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                >
                  Download
                </a>
              )}
            </Row>
          </dl>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): ReactElement {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2 items-start">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}
