// Gallery thumbnail card. Lazy-loads via /api/assets/:id/file. Click fires
// onSelect for detail modal. Handles status="error" / imageUrl=null with a
// red-ish fallback card showing the error message.

import type { ReactElement } from "react"
import { COLOR_CLASSES } from "@/core/design"
import { WORKFLOW_COLORS } from "@/core/design/tokens"
import type { AssetDto } from "@/core/dto/asset-dto"
import { formatCost } from "@/client/utils/format"
import { ReplayBadge, ReplayedFromChip } from "./ReplayBadge"

export interface AssetThumbnailProps {
  asset: AssetDto
  onSelect: (asset: AssetDto) => void
  onOpenSource?: (sourceAssetId: string) => void
}

export function AssetThumbnail({
  asset,
  onSelect,
  onOpenSource,
}: AssetThumbnailProps): ReactElement {
  const tone = COLOR_CLASSES[WORKFLOW_COLORS[asset.workflowId]]
  const failed = asset.status === "error" || asset.imageUrl === null
  return (
    <button
      type="button"
      onClick={() => onSelect(asset)}
      className={`relative rounded-md border overflow-hidden aspect-square ${
        failed ? "border-red-800" : "border-slate-700 hover:border-slate-500"
      }`}
    >
      {failed ? (
        <div className="flex h-full w-full items-center justify-center bg-red-950/40 text-[10px] text-red-400 p-2 text-center">
          {asset.errorMessage ?? "error"}
        </div>
      ) : (
        <img
          src={asset.imageUrl ?? ""}
          alt={asset.promptRaw.slice(0, 60)}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      )}
      <div className="absolute top-1 right-1 flex flex-col items-end gap-1">
        <ReplayBadge replayClass={asset.replayClass} />
        {asset.replayedFromAssetId !== null && onOpenSource !== undefined && (
          <ReplayedFromChip
            sourceAssetId={asset.replayedFromAssetId}
            onOpenSource={onOpenSource}
          />
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent p-1">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${tone.badge}`}>
          {asset.workflowId}
        </span>
        {asset.costUsd !== null && asset.costUsd > 0 && (
          <span className="inline-block rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">
            {formatCost(asset.costUsd)}
          </span>
        )}
      </div>
    </button>
  )
}
