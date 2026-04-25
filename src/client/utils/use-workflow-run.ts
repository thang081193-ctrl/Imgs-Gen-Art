// Wraps useSSE with WorkflowEvent parsing + batch-state tracking. Fires
// toasts on terminal events (complete / aborted) with Gallery CTA; maps
// SSE status → run state so the caller can enable/disable Run button.
//
// The caller passes a `buildBody` function that constructs the fresh
// request body at start-time (input can change between runs). `start()`
// bumps a nonce so the underlying useSSE effect re-fires.

import { useCallback, useEffect, useRef, useState } from "react"
import { useSSE } from "./use-sse"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import type { WorkflowId } from "@/core/design/types"
import type { NavParams, Page } from "@/client/navigator"
import type { ShowToast } from "@/client/components/ToastHost"

export type RunState = "idle" | "running" | "complete" | "aborted" | "error"

export interface UseWorkflowRunOptions {
  workflowId: WorkflowId | null
  buildBody: () => unknown
  showToast: ShowToast
  navigate: (page: Page, params?: NavParams) => void
}

// S#44 D2 (Q-45.B LOCKED) — policy events surface alongside the raw
// stream so the wizard can react without re-scanning `events`. Latest
// policy_blocked / policy_warned wins; cleared on next start().
export type PolicyRunEvent = Extract<
  WorkflowEvent,
  { type: "policy_blocked" } | { type: "policy_warned" }
>

export interface WorkflowRunHandle {
  runState: RunState
  batchId: string | null
  total: number
  completedCount: number
  events: WorkflowEvent[]
  policyEvent: PolicyRunEvent | null
  start: () => void
  cancel: () => Promise<void>
}

export function useWorkflowRun(opts: UseWorkflowRunOptions): WorkflowRunHandle {
  const { workflowId, buildBody, showToast, navigate } = opts

  const [runState, setRunState] = useState<RunState>("idle")
  const [runNonce, setRunNonce] = useState<number>(0)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [total, setTotal] = useState<number>(0)
  const [completedCount, setCompletedCount] = useState<number>(0)
  const [events, setEvents] = useState<WorkflowEvent[]>([])
  const [policyEvent, setPolicyEvent] = useState<PolicyRunEvent | null>(null)
  const [runBody, setRunBody] = useState<unknown>(null)

  // Ref mirrors runState so `cancel()` sees the latest value without stale
  // closures. Guards the race where a Mock batch completes (runState →
  // "complete" via SSE) between the user's Cancel click and the DELETE fetch,
  // which would otherwise produce a benign 409 BATCH_NOT_RUNNING.
  const runStateRef = useRef<RunState>("idle")
  useEffect(() => {
    runStateRef.current = runState
  }, [runState])

  const runUrl = runState === "running" && workflowId !== null && runNonce > 0
    ? `/api/workflows/${workflowId}/run?_=${runNonce}`
    : ""

  const onSSEEvent = useCallback((ev: { event: string; data: string }) => {
    let parsed: WorkflowEvent
    try {
      parsed = JSON.parse(ev.data) as WorkflowEvent
    } catch {
      return
    }
    setEvents((prev) => [...prev, parsed])
    if (parsed.type === "policy_blocked" || parsed.type === "policy_warned") {
      setPolicyEvent(parsed)
    }
    if (parsed.type === "started") {
      setBatchId(parsed.batchId)
      setTotal(parsed.total)
    } else if (parsed.type === "image_generated" || parsed.type === "error") {
      setCompletedCount((n) => n + 1)
    } else if (parsed.type === "aborted") {
      setRunState("aborted")
      setCompletedCount(parsed.completedCount)
      setTotal(parsed.totalCount)
      const bid = parsed.batchId
      showToast({
        variant: "warning",
        message: `Batch aborted. ${parsed.completedCount}/${parsed.totalCount} assets saved to Gallery.`,
        cta: { label: "View in Gallery →", onClick: () => navigate("gallery", { batchId: bid }) },
      })
    } else if (parsed.type === "complete") {
      setRunState("complete")
      setCompletedCount(parsed.assets.length)
      const bid = parsed.batchId
      showToast({
        variant: "success",
        message: `Batch complete — ${parsed.assets.length} asset(s) saved.`,
        cta: { label: "View in Gallery →", onClick: () => navigate("gallery", { batchId: bid }) },
      })
    }
  }, [showToast, navigate])

  const sse = useSSE(runUrl, {
    enabled: runState === "running" && runUrl !== "",
    method: "POST",
    body: runBody,
    onEvent: onSSEEvent,
  })

  // Transport-level failure (non-2xx, network drop) when no terminal event
  // fired — surface as error and unlock Run.
  useEffect(() => {
    if (runState !== "running") return
    if (sse.status === "error") {
      setRunState("error")
      showToast({ variant: "danger", message: `Run error: ${sse.error?.message ?? "unknown"}` })
    } else if (sse.status === "closed") {
      const sawTerminal = events.some(
        (e) => e.type === "complete" || e.type === "aborted",
      )
      if (!sawTerminal) {
        setRunState("error")
        showToast({ variant: "danger", message: "Stream closed unexpectedly" })
      }
    }
  }, [sse.status, sse.error, runState, events, showToast])

  const start = useCallback((): void => {
    setEvents([])
    setBatchId(null)
    setTotal(0)
    setCompletedCount(0)
    setPolicyEvent(null)
    setRunBody(buildBody())
    setRunState("running")
    setRunNonce((n) => n + 1)
  }, [buildBody])

  const cancel = useCallback(async (): Promise<void> => {
    if (runStateRef.current !== "running") return
    sse.abort()
    if (batchId !== null) {
      try {
        await fetch(`/api/workflows/runs/${batchId}`, { method: "DELETE" })
      } catch {
        // server also sees client-disconnect via abortSignal; DELETE is just explicit intent.
      }
    }
  }, [sse, batchId])

  return {
    runState,
    batchId,
    total,
    completedCount,
    events,
    policyEvent,
    start,
    cancel,
  }
}
