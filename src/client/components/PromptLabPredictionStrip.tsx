// Phase 5 Step 5b (Session #27b) — PromptLab prediction strip.
// Shows predicted replayClass (recomputed on addWatermark toggle), estimated
// cost (from /replay-class probe), and live streaming/complete state.
//
// Extracted from PromptLab.tsx to stay under the 300-LOC hard cap (Rule 7).

import type { ReactElement } from "react"

import { formatCost } from "@/client/utils/format"

export interface PromptLabPredictionStripProps {
  predictedReplayClass: string
  estimatedCost: number | null
  replayState: string
  elapsedMs: number
  resultAssetId: string | null
  onOpenResult: () => void
}

export function PromptLabPredictionStrip({
  predictedReplayClass,
  estimatedCost,
  replayState,
  elapsedMs,
  resultAssetId,
  onOpenResult,
}: PromptLabPredictionStripProps): ReactElement {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-300">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-slate-500 uppercase tracking-wide text-[10px]">
          Prediction
        </span>
        <span>
          replayClass →{" "}
          <span className="font-mono text-slate-200">
            {predictedReplayClass}
          </span>
        </span>
        {estimatedCost !== null && (
          <span>
            est. cost →{" "}
            <span className="font-mono text-slate-200">
              {formatCost(estimatedCost)}
            </span>
          </span>
        )}
        {replayState === "streaming" && (
          <span className="text-sky-300 font-mono">
            running · {(elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
        {replayState === "complete" && resultAssetId !== null && (
          <button
            type="button"
            onClick={onOpenResult}
            className="ml-auto rounded bg-emerald-900/60 border border-emerald-800 px-2 py-0.5 text-[11px] text-emerald-200 hover:bg-emerald-900"
          >
            Open result in Gallery ↗
          </button>
        )}
      </div>
    </div>
  )
}
