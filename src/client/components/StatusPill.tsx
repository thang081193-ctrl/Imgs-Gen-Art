// S#38 PLAN-v3 §5.1 — extracted health-poll pill so the polling logic is
// testable in isolation (without mounting AppHeader). Polls /api/health
// every 30s, derives a tri-state (Sẵn sàng / Degraded / Lỗi) from the
// last fetch outcome. Network failure → "Lỗi"; HTTP 200 with status:"ok"
// → "Sẵn sàng"; HTTP 200 with non-ok body or 5xx-cached failure window
// → "Degraded".
//
// `intervalMs` + `fetchHealth` are injectable for tests so we don't need
// to monkey-patch global fetch or fast-forward 30 seconds of real time.

import { useEffect, useRef, useState } from "react"
import type { ReactElement } from "react"
import type { HealthData } from "@/client/api/hooks"
import { apiGet } from "@/client/api/client"

export const STATUS_PILL_POLL_MS = 30_000

export type StatusPillState = "ready" | "degraded" | "error" | "loading"

const STATE_LABELS: Record<StatusPillState, string> = {
  loading: "Đang kiểm tra…",
  ready: "Sẵn sàng",
  degraded: "Degraded",
  error: "Lỗi",
}

const STATE_CLASSES: Record<StatusPillState, string> = {
  loading: "bg-slate-800 text-slate-300 border-slate-700",
  ready: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60",
  degraded: "bg-amber-950/60 text-amber-300 border-amber-800/60",
  error: "bg-red-950/60 text-red-300 border-red-800/60",
}

const DOT_CLASSES: Record<StatusPillState, string> = {
  loading: "bg-slate-500 animate-pulse",
  ready: "bg-emerald-400",
  degraded: "bg-amber-400",
  error: "bg-red-400",
}

export interface StatusPillProps {
  intervalMs?: number
  fetchHealth?: () => Promise<HealthData>
  /** Notifies parents (AppHeader) of the latest payload — used for the
   *  "last gen {rel time}" strip without forcing a second fetch. */
  onHealth?: (data: HealthData | null) => void
}

const defaultFetch = (): Promise<HealthData> => apiGet<HealthData>("/api/health")

export function StatusPill({
  intervalMs = STATUS_PILL_POLL_MS,
  fetchHealth = defaultFetch,
  onHealth,
}: StatusPillProps): ReactElement {
  const [state, setState] = useState<StatusPillState>("loading")
  // Latest onHealth ref so a new callback after re-render doesn't restart
  // the poll loop (which would reset the 30s cadence).
  const onHealthRef = useRef(onHealth)
  onHealthRef.current = onHealth

  useEffect(() => {
    let cancelled = false
    const tick = async (): Promise<void> => {
      try {
        const data = await fetchHealth()
        if (cancelled) return
        const next: StatusPillState = data.status === "ok" ? "ready" : "degraded"
        setState(next)
        onHealthRef.current?.(data)
      } catch {
        if (cancelled) return
        setState("error")
        onHealthRef.current?.(null)
      }
    }
    void tick()
    const handle = setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      clearInterval(handle)
    }
  }, [intervalMs, fetchHealth])

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="status-pill"
      data-state={state}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${STATE_CLASSES[state]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[state]}`} />
      {STATE_LABELS[state]}
    </span>
  )
}
