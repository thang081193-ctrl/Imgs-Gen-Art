// Session #26 (Phase 5 Step 2) — Gallery tile badge chip driven entirely by
// `asset.replayClass` already present on AssetDto. No extra /replay-class
// probe per tile (Q I: server is single source of truth).
//
// Q J approved: 3 visual states with green / amber / muted pills. Tooltips
// are the static class-level copy (Q2 approved verbatim). Per-reason tooltip
// is only surfaced in AssetDetailModal after the probe fires — gallery
// hover uses the generic "cannot replay" copy to avoid an N-tile probe fan-out.

import type { ReactElement } from "react"

import type { ReplayClass } from "@/core/dto/asset-dto"

interface BadgeTone {
  label: string
  classes: string
  tooltip: string
}

const TONE: Record<ReplayClass, BadgeTone> = {
  deterministic: {
    label: "EXACT",
    classes:
      "border-green-700 bg-green-900/60 text-green-200",
    tooltip: "Deterministic replay — same seed produces identical bytes",
  },
  best_effort: {
    label: "APPROX",
    classes:
      "border-yellow-700 bg-yellow-900/60 text-yellow-200",
    tooltip: "Approximate replay — similar but not identical",
  },
  not_replayable: {
    label: "—",
    classes:
      "border-slate-700 bg-slate-900/80 text-slate-400",
    tooltip: "Cannot replay — watermark applied or seed missing",
  },
}

export function ReplayBadge({
  replayClass,
}: {
  replayClass: ReplayClass
}): ReactElement {
  const tone = TONE[replayClass]
  return (
    <span
      title={tone.tooltip}
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono ${tone.classes}`}
    >
      {tone.label}
    </span>
  )
}

// Small "↩ replay of ast_xxx" chip shown on tiles where the asset was itself
// generated via replay. Click propagates up to the gallery so the container
// can open the source asset's detail modal.
export function ReplayedFromChip({
  sourceAssetId,
  onOpenSource,
}: {
  sourceAssetId: string
  onOpenSource: (assetId: string) => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpenSource(sourceAssetId)
      }}
      title={`Replay of ${sourceAssetId}`}
      className="inline-flex items-center gap-0.5 rounded border border-sky-800/70 bg-sky-950/70 px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-sky-900 font-mono"
    >
      <span aria-hidden="true">↩</span>
      <span className="truncate max-w-[80px]">{sourceAssetId}</span>
    </button>
  )
}
