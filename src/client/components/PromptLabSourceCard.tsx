// Phase 5 Step 5b (Session #27b) — PromptLab left column. Source asset
// thumbnail + read-only metadata + replayClass badge.
//
// Extracted from PromptLab.tsx to stay under the 300-LOC hard cap (Rule 7).

import type { ReactElement } from "react"

import { ReplayBadge } from "@/client/components/ReplayBadge"
import type { AssetDto } from "@/core/dto/asset-dto"

export interface PromptLabSourceCardProps {
  asset: AssetDto
}

export function PromptLabSourceCard({
  asset,
}: PromptLabSourceCardProps): ReactElement {
  return (
    <aside
      className="space-y-2 rounded-md border border-slate-800 bg-slate-900/40 p-3"
      aria-label="Source asset"
    >
      {asset.imageUrl !== null ? (
        <img
          src={asset.imageUrl}
          alt={asset.promptRaw}
          className="w-full rounded border border-slate-800"
        />
      ) : (
        <div className="flex aspect-square items-center justify-center rounded border border-slate-800 bg-slate-900 text-xs text-slate-500">
          no image
        </div>
      )}
      <div className="text-[11px] text-slate-400 space-y-1">
        <p>
          <span className="text-slate-500">Provider:</span>{" "}
          <span className="font-mono">
            {asset.providerId}:{asset.modelId}
          </span>
        </p>
        {asset.seed !== null && (
          <p>
            <span className="text-slate-500">Seed:</span>{" "}
            <span className="font-mono">{asset.seed}</span>
          </p>
        )}
        <p>
          <span className="text-slate-500">Aspect:</span> {asset.aspectRatio}
        </p>
        <p className="flex items-center gap-2">
          <span className="text-slate-500">Replay:</span>
          <ReplayBadge replayClass={asset.replayClass} />
        </p>
      </div>
    </aside>
  )
}
