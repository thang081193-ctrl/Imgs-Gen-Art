// Phase 5 Step 5b (Session #27b) — PromptLab page.
//
// Entry: navigator.go("prompt-lab", { assetId }). If assetId is missing,
// the page shows an info state (standalone "fresh composition" mode is
// deferred per Session #27b Q5).
//
// Layout (lg+): 3 columns.
//   Left   — PromptLabSourceCard (thumbnail + read-only metadata + badge)
//   Middle — PromptEditor (textarea + overrides + Run/Reset/Cancel) +
//            PromptLabPredictionStrip (predicted class + cost + SSE status)
//   Right  — DiffViewer (inline) + PromptHistorySidebar
//
// Recompute strategy (per handoff):
//   - Diff renders on every keystroke (cheap — LCS on prompt-sized input)
//   - Predicted replayClass preview recomputes only on addWatermark toggle
//     (prompt edits never cross the watermark boundary; avoids render
//     thrashing)

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactElement } from "react"

import { useAsset, useProviders } from "@/client/api/hooks"
import { DiffViewer } from "@/client/components/DiffViewer"
import { PromptEditor, type PromptEditorState } from "@/client/components/PromptEditor"
import { PromptHistorySidebar } from "@/client/components/PromptHistorySidebar"
import { PromptLabPredictionStrip } from "@/client/components/PromptLabPredictionStrip"
import { PromptLabSourceCard } from "@/client/components/PromptLabSourceCard"
import type { ShowToast } from "@/client/components/ToastHost"
import { classifyReplayError } from "@/client/lib/replay-errors"
import { usePromptHistory } from "@/client/utils/use-prompt-history"
import { useReplayClass } from "@/client/utils/use-replay-class"
import { useReplay } from "@/client/utils/use-replay"
import type { AssetDto } from "@/core/dto/asset-dto"
import type { ModelInfo } from "@/core/model-registry/types"
import type { OverridePayload } from "@/core/schemas/override-payload"
import type { PromptHistoryDto } from "@/core/dto/prompt-history-dto"
import type { Navigator } from "@/client/navigator"

export interface PromptLabProps {
  navigator: Navigator
  showToast: ShowToast
}

export function PromptLab({ navigator, showToast }: PromptLabProps): ReactElement {
  const assetId = navigator.params.assetId ?? null
  const assetQ = useAsset(assetId)
  const providersQ = useProviders()
  const probe = useReplayClass(assetId)
  const history = usePromptHistory(assetId)
  const replay = useReplay()

  const [editorState, setEditorState] = useState<PromptEditorState>({
    prompt: "",
    addWatermark: false,
    negativePrompt: "",
  })
  const [prefillRequest, setPrefillRequest] = useState<string | null>(null)

  const asset: AssetDto | null = assetQ.data
  const model: ModelInfo | null = useMemo(() => {
    if (asset === null || providersQ.data === null) return null
    return (
      providersQ.data.models.find(
        (m) => m.id === asset.modelId && m.providerId === asset.providerId,
      ) ?? null
    )
  }, [asset, providersQ.data])

  useEffect(() => {
    if (replay.state === "complete") history.refresh()
  }, [replay.state, history])

  useEffect(() => {
    if (replay.state === "error" && replay.error !== null) {
      const info = classifyReplayError(replay.error)
      showToast({ variant: "danger", message: info.message })
      replay.reset()
    } else if (replay.state === "cancelled") {
      showToast({ variant: "info", message: "Edit cancelled." })
      replay.reset()
    }
  }, [replay, showToast])

  const running = replay.state === "dispatching" || replay.state === "streaming"

  const handleRun = useCallback(
    (override: OverridePayload): void => {
      if (asset === null) return
      replay.start(asset.id, { overridePayload: override })
    },
    [asset, replay],
  )

  const handlePickHistory = useCallback((entry: PromptHistoryDto): void => {
    setPrefillRequest(entry.promptRaw)
  }, [])

  if (assetId === null) {
    return (
      <main className="mx-auto max-w-3xl p-6 space-y-3">
        <h1 className="text-xl font-bold text-slate-200">PromptLab</h1>
        <p className="text-sm text-slate-400">
          PromptLab opens from an asset. Go to Gallery, click an asset, then
          press <span className="text-slate-200 font-medium">[Edit &amp; replay]</span>.
        </p>
        <button
          type="button"
          onClick={() => navigator.go("gallery")}
          className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
        >
          Back to Gallery
        </button>
      </main>
    )
  }

  if (assetQ.loading) return <Placeholder message="Loading asset…" />
  if (assetQ.error !== null)
    return <Placeholder message={`Failed to load asset: ${assetQ.error.message}`} error />
  if (asset === null) return <Placeholder message="Asset not found." error />
  if (asset.editable.canEdit === false) {
    return (
      <LegacyBlock asset={asset} navigator={navigator} reason={asset.editable.reason ?? null} />
    )
  }

  const predictedReplayClass = editorState.addWatermark
    ? "not_replayable"
    : asset.replayClass
  const estimatedCost =
    probe.data !== null && probe.data.replayClass !== "not_replayable"
      ? probe.data.estimatedCostUsd
      : null

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">PromptLab</h1>
          <p className="text-xs text-slate-500">
            Edit &amp; replay asset{" "}
            <code className="font-mono text-slate-300">{asset.id}</code>
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigator.go("gallery")}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
        >
          ← Gallery
        </button>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(220px,1fr)_minmax(320px,2fr)_minmax(260px,1.4fr)]">
        <PromptLabSourceCard asset={asset} />
        <div className="space-y-4">
          <PromptEditor
            source={asset}
            model={model}
            running={running}
            onStateChange={setEditorState}
            onRun={handleRun}
            onCancel={() => void replay.cancel()}
            onReset={() => {
              replay.reset()
              setPrefillRequest(null)
            }}
          />
          <PromptLabPredictionStrip
            predictedReplayClass={predictedReplayClass}
            estimatedCost={estimatedCost}
            replayState={replay.state}
            elapsedMs={replay.elapsedMs}
            resultAssetId={replay.result?.id ?? null}
            onOpenResult={() => {
              if (replay.result !== null) {
                navigator.go(
                  "gallery",
                  replay.result.batchId !== null
                    ? { batchId: replay.result.batchId }
                    : {},
                )
              }
            }}
          />
          {prefillRequest !== null && (
            <PrefillHint
              text={prefillRequest}
              onDismiss={() => setPrefillRequest(null)}
            />
          )}
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Diff</h3>
            <DiffViewer before={asset.promptRaw} after={editorState.prompt} />
          </div>
          <PromptHistorySidebar
            history={history.data}
            loading={history.loading}
            error={history.error}
            onPick={handlePickHistory}
          />
        </div>
      </div>
    </main>
  )
}

function PrefillHint({
  text,
  onDismiss,
}: {
  text: string
  onDismiss: () => void
}): ReactElement {
  return (
    <div className="rounded-md border border-sky-900/60 bg-sky-950/30 p-2 text-xs text-sky-200 flex items-start gap-2">
      <span className="font-mono text-[10px] uppercase mt-0.5">prefill</span>
      <span className="flex-1">
        Copy this into the editor above to reuse:
        <br />
        <span className="text-sky-100">{text}</span>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded bg-sky-900/60 px-1.5 py-0.5 text-[11px] text-sky-200 hover:bg-sky-900"
      >
        Dismiss
      </button>
    </div>
  )
}

function LegacyBlock({
  asset,
  navigator,
  reason,
}: {
  asset: AssetDto
  navigator: Navigator
  reason: string | null
}): ReactElement {
  const copy =
    reason === "legacy_payload"
      ? "This asset predates the edit & replay feature. Replay is supported but editing is not. Create a new batch to use edit & replay."
      : "This asset cannot be edited (the replay payload is not compatible with edit mode)."
  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-xl font-bold text-slate-200">PromptLab</h1>
      <p className="text-sm text-slate-300">{copy}</p>
      <p className="text-xs text-slate-500">
        Source: <code className="font-mono">{asset.id}</code>
      </p>
      <button
        type="button"
        onClick={() => navigator.go("gallery")}
        className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
      >
        Back to Gallery
      </button>
    </main>
  )
}

function Placeholder({
  message,
  error,
}: {
  message: string
  error?: boolean
}): ReactElement {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <p className={`text-sm ${error === true ? "text-red-400" : "text-slate-400"}`}>
        {message}
      </p>
    </main>
  )
}
