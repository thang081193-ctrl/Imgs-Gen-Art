// Session #26 (Phase 5 Step 2) — Replay SSE consumer composed on top of useSSE.
// Mirrors use-workflow-run.ts structure but decouples from workflow-specific
// event types: replay never emits `concept_generated` and always produces a
// single image. Surfaces a state machine the AssetDetailModal renders button
// states from.
//
// Cancel path mirrors workflow run: abort the SSE + fire DELETE
// /api/workflows/runs/:batchId. For replay batches, DELETE may 404 (replay
// service doesn't register with abort-registry) — treat as benign.

import { useCallback, useEffect, useRef, useState } from "react"

import type { AssetDto } from "@/core/dto/asset-dto"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"

import { useSSE } from "./use-sse"

export type ReplayState =
  | "idle"
  | "dispatching"
  | "streaming"
  | "complete"
  | "cancelled"
  | "error"

export interface ReplayHandle {
  state: ReplayState
  batchId: string | null
  result: AssetDto | null
  error: Error | null
  elapsedMs: number
  start: (assetId: string) => void
  cancel: () => Promise<void>
  reset: () => void
}

export function useReplay(): ReplayHandle {
  const [state, setState] = useState<ReplayState>("idle")
  const [assetId, setAssetId] = useState<string | null>(null)
  const [runNonce, setRunNonce] = useState<number>(0)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [result, setResult] = useState<AssetDto | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number>(0)

  // Mirror latest state so cancel() doesn't capture stale values.
  const stateRef = useRef<ReplayState>("idle")
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Tick the elapsed counter while streaming so the modal can show a running
  // duration label. Cleared on terminal state.
  useEffect(() => {
    if (state !== "streaming" || startedAt === null) return undefined
    const h = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 100)
    return () => window.clearInterval(h)
  }, [state, startedAt])

  const url = state === "dispatching" || state === "streaming"
    ? (assetId !== null && runNonce > 0
      ? `/api/assets/${assetId}/replay?_=${runNonce}`
      : "")
    : ""

  const onSSEEvent = useCallback((ev: { event: string; data: string }) => {
    let parsed: WorkflowEvent
    try {
      parsed = JSON.parse(ev.data) as WorkflowEvent
    } catch {
      return
    }
    if (parsed.type === "started") {
      setBatchId(parsed.batchId)
      setStartedAt(Date.now())
      setState("streaming")
    } else if (parsed.type === "image_generated") {
      setResult(parsed.asset)
    } else if (parsed.type === "error") {
      setError(new Error(parsed.error.message))
    } else if (parsed.type === "aborted") {
      setState("cancelled")
    } else if (parsed.type === "complete") {
      // Error event fires BEFORE complete for provider failures; preserve the
      // error state rather than overwriting with "complete". Empty assets
      // array + existing error → "error" final state.
      if (parsed.assets.length === 0 || stateRef.current === "error") {
        setState("error")
      } else {
        setState("complete")
        setResult(parsed.assets[0] ?? null)
      }
    }
  }, [])

  const sse = useSSE(url, {
    enabled: (state === "dispatching" || state === "streaming") && url !== "",
    method: "POST",
    body: {},
    onEvent: onSSEEvent,
  })

  // Transport-level failure (non-2xx precondition, network drop). Only fires
  // if we never saw a terminal event.
  useEffect(() => {
    if (state !== "dispatching" && state !== "streaming") return
    if (sse.status === "error") {
      const e = sse.error ?? new Error("SSE transport error")
      setError(e)
      setState("error")
    }
  }, [sse.status, sse.error, state])

  const start = useCallback((targetAssetId: string): void => {
    setBatchId(null)
    setResult(null)
    setError(null)
    setStartedAt(null)
    setElapsedMs(0)
    setAssetId(targetAssetId)
    setState("dispatching")
    setRunNonce((n) => n + 1)
  }, [])

  const cancel = useCallback(async (): Promise<void> => {
    if (stateRef.current !== "dispatching" && stateRef.current !== "streaming") {
      return
    }
    sse.abort()
    if (batchId !== null) {
      try {
        await fetch(`/api/workflows/runs/${batchId}`, { method: "DELETE" })
      } catch {
        // Client-disconnect already propagated cancel server-side via the
        // abort signal; DELETE is belt-and-suspenders. 404 is benign for
        // replay batches not in the abort-registry.
      }
    }
    setState("cancelled")
  }, [sse, batchId])

  const reset = useCallback((): void => {
    setState("idle")
    setBatchId(null)
    setResult(null)
    setError(null)
    setStartedAt(null)
    setElapsedMs(0)
  }, [])

  return { state, batchId, result, error, elapsedMs, start, cancel, reset }
}
