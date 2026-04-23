// Session #26 (Phase 5 Step 2) — extracted from AssetDetailModal so that
// file stays under the 300-LOC hard cap. The probe hook + SSE state machine
// render here; parent only wires callbacks (showToast, onOpenAsset,
// onFilterBatch).

import { useEffect } from "react"
import type { ReactElement } from "react"

import type { AssetDto } from "@/core/dto/asset-dto"
import {
  classifyReplayError,
  notReplayableTooltip,
} from "@/client/lib/replay-errors"
import type { ShowToast } from "@/client/components/ToastHost"
import { formatCost } from "@/client/utils/format"
import { useReplay } from "@/client/utils/use-replay"
import {
  type ReplayClassProbe,
  useReplayClass,
} from "@/client/utils/use-replay-class"

export interface ReplaySectionProps {
  asset: AssetDto
  onFilterBatch: (batchId: string) => void
  onOpenAsset: (asset: AssetDto) => void
  onEditAsset: (asset: AssetDto) => void
  showToast: ShowToast
}

export function ReplaySection({
  asset,
  onFilterBatch,
  onOpenAsset,
  onEditAsset,
  showToast,
}: ReplaySectionProps): ReactElement {
  const probe = useReplayClass(asset.id)
  const replay = useReplay()

  useEffect(() => {
    if (replay.state === "error" && replay.error !== null) {
      const info = classifyReplayError(replay.error)
      showToast({ variant: "danger", message: info.message })
      replay.reset()
    } else if (replay.state === "cancelled") {
      showToast({ variant: "info", message: "Replay cancelled." })
      replay.reset()
    }
  }, [replay, replay.state, replay.error, showToast])

  return (
    <div className="mt-6 border-t border-slate-800 pt-4">
      <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
        Replay
      </h3>
      {probe.loading && <ProbeSkeleton />}
      {probe.error !== null && (
        <p className="text-xs text-red-400">
          Probe failed: {probe.error.message}
        </p>
      )}
      {probe.data !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <ReplayControl
            probe={probe.data}
            replay={replay}
            onStart={() => replay.start(asset.id)}
          />
          <EditReplayButton
            asset={asset}
            probe={probe.data}
            onEdit={() => onEditAsset(asset)}
          />
        </div>
      )}
      {replay.state === "complete" && replay.result !== null && (
        <ResultCard
          result={replay.result}
          onOpen={() => onOpenAsset(replay.result as AssetDto)}
          onOpenInGallery={() => {
            const bid = (replay.result as AssetDto).batchId
            if (bid !== null) onFilterBatch(bid)
          }}
        />
      )}
    </div>
  )
}

function ProbeSkeleton(): ReactElement {
  return (
    <div className="inline-block h-8 w-56 animate-pulse rounded-md bg-slate-800" />
  )
}

// Session #27b — PromptLab entry point. Disabled when the asset is legacy
// (replay-only, per Q-5b.3 alignment) OR not_replayable. Priority per Q6
// Refinement 2: not_replayable tooltip wins over legacy-payload tooltip.
function EditReplayButton({
  asset,
  probe,
  onEdit,
}: {
  asset: AssetDto
  probe: ReplayClassProbe
  onEdit: () => void
}): ReactElement {
  const isNotReplayable = probe.replayClass === "not_replayable"
  const isLegacy =
    !isNotReplayable && asset.editable.canEdit === false
  const disabled = isNotReplayable || isLegacy

  let tooltip: string | undefined
  if (isNotReplayable) tooltip = notReplayableTooltip(probe.reason)
  else if (isLegacy)
    tooltip =
      "This asset predates the edit & replay feature. Replay is supported but editing is not. Create a new batch to use edit & replay."

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onEdit}
      title={tooltip}
      className={
        disabled
          ? "rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-500 cursor-not-allowed"
          : "rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
      }
    >
      Edit &amp; replay
    </button>
  )
}

function ReplayControl({
  probe,
  replay,
  onStart,
}: {
  probe: ReplayClassProbe
  replay: ReturnType<typeof useReplay>
  onStart: () => void
}): ReactElement {
  if (probe.replayClass === "not_replayable") {
    return (
      <button
        type="button"
        disabled
        title={notReplayableTooltip(probe.reason)}
        className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-500 cursor-not-allowed"
      >
        Replay unavailable
      </button>
    )
  }

  const label = probe.replayClass === "deterministic" ? "exact" : "approximate"
  const cost = formatCost(probe.estimatedCostUsd)

  if (replay.state === "dispatching") {
    return (
      <button
        type="button"
        disabled
        className="rounded-md border border-sky-700 bg-sky-900/60 px-3 py-1.5 text-xs text-sky-200"
      >
        Starting…
      </button>
    )
  }

  if (replay.state === "streaming") {
    const seconds = (replay.elapsedMs / 1000).toFixed(1)
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          className="rounded-md border border-sky-700 bg-sky-900/60 px-3 py-1.5 text-xs text-sky-200 font-mono"
        >
          Replaying… {seconds}s · {cost} running
        </button>
        <button
          type="button"
          onClick={() => {
            void replay.cancel()
          }}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (replay.state === "complete") {
    return (
      <button
        type="button"
        disabled
        className="rounded-md border border-green-700 bg-green-900/60 px-3 py-1.5 text-xs text-green-200"
      >
        Replay complete ✓
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onStart}
      className="rounded-md bg-sky-700 hover:bg-sky-600 px-3 py-1.5 text-xs text-white font-medium"
    >
      Replay ({label}) · {cost}
    </button>
  )
}

function ResultCard({
  result,
  onOpen,
  onOpenInGallery,
}: {
  result: AssetDto
  onOpen: () => void
  onOpenInGallery: () => void
}): ReactElement {
  return (
    <div className="mt-3 rounded-md border border-green-800/60 bg-green-950/30 p-3">
      <p className="text-[10px] uppercase tracking-wide text-green-400 mb-2">
        Replay result · just now
      </p>
      <div className="flex items-center gap-3">
        {result.imageUrl !== null && (
          <img
            src={result.imageUrl}
            alt={result.id}
            className="h-24 w-24 rounded border border-slate-800 object-cover"
          />
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-mono text-xs text-slate-200 truncate">{result.id}</p>
          <p className="text-[11px] text-slate-400">
            {result.providerId}:{result.modelId}
            {result.costUsd !== null && ` · ${formatCost(result.costUsd)}`}
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onOpen}
              className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
            >
              Open ↗
            </button>
            <button
              type="button"
              onClick={onOpenInGallery}
              className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
            >
              Open in Gallery
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
