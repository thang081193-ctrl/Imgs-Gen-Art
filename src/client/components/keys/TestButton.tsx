// Inline "Test" button for a key slot row. Per Q3:
//   - spinner while probing
//   - status badge replaces spinner after result (latency for "ok")
//   - transition toast: only when status flips between runs, or first-run
//     error → user gets loud feedback; silent on repeated same-state.
// Badge is clickable → tooltip with the HealthStatus.message.

import { useState } from "react"
import type { ReactElement } from "react"
import { testKey, type SlotTestResponse } from "@/client/api/hooks"
import { ApiError } from "@/client/api/client"
import type { ShowToast } from "@/client/components/ToastHost"

export type HealthStatusCode = SlotTestResponse["status"]

const STATUS_CLASS: Record<HealthStatusCode, string> = {
  ok:               "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  auth_error:       "bg-red-500/10 text-red-400 border-red-500/30",
  quota_exceeded:   "bg-amber-500/10 text-amber-400 border-amber-500/30",
  rate_limited:     "bg-amber-500/10 text-amber-400 border-amber-500/30",
  down:             "bg-slate-600/20 text-slate-300 border-slate-500/30",
  unknown:          "bg-slate-700/30 text-slate-400 border-slate-600/30",
}

export interface TestButtonProps {
  slotId: string
  showToast: ShowToast
}

export function TestButton({ slotId, showToast }: TestButtonProps): ReactElement {
  const [state, setState] = useState<SlotTestResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runTest(): Promise<void> {
    if (running) return
    setRunning(true)
    setError(null)
    const prev = state
    try {
      const result = await testKey(slotId)
      setState(result)
      // Transition toast logic (Q3 refine)
      const prevStatus = prev?.status ?? null
      const prevIsError = prevStatus !== null && prevStatus !== "ok"
      const nowIsError = result.status !== "ok"
      const transitioned = prevStatus !== null && prevStatus !== result.status
      if (transitioned) {
        if (result.status === "ok") {
          showToast({
            message: `Slot tested OK (${result.latencyMs}ms)`,
            variant: "success",
          })
        } else {
          showToast({
            message: `Slot test failed: ${result.status}`,
            variant: result.status === "quota_exceeded" || result.status === "rate_limited" ? "warning" : "danger",
          })
        }
      } else if (prevStatus === null && nowIsError) {
        showToast({
          message: `Slot test: ${result.status}${result.message ? ` — ${result.message}` : ""}`,
          variant: result.status === "quota_exceeded" || result.status === "rate_limited" ? "warning" : "danger",
        })
      }
      // Silent otherwise: same-state repeats, or first-run "ok".
      void prevIsError
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Test failed"
      setError(msg)
      showToast({ message: `Slot test error: ${msg}`, variant: "danger" })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={runTest}
        disabled={running}
        className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
      >
        {running ? "Testing…" : "Test"}
      </button>
      {state !== null && !running && (
        <span
          title={state.message ?? `Latency ${state.latencyMs}ms — checked ${state.checkedAt}`}
          className={`rounded border px-2 py-0.5 text-xs font-mono ${STATUS_CLASS[state.status]}`}
        >
          {state.status === "ok" ? `ok ${state.latencyMs}ms` : state.status}
        </span>
      )}
      {error !== null && !running && (
        <span className="text-xs text-red-400" title={error}>
          error
        </span>
      )}
    </div>
  )
}
