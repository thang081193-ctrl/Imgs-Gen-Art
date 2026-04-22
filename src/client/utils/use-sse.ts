// Fetch-based SSE hook with AbortController cleanup. Supports GET (default)
// and POST with JSON body; `onEvent` fires per-event so callers can react
// (extract batchId from `started`, etc.). `abort()` in the return value is
// the imperative cancel path — wired to Workflow page's Cancel button which
// also fires `DELETE /api/workflows/runs/:batchId` server-side.
//
// Wire format parsed: `event: <name>\ndata: <string>\n\n`. Multi-line data
// is re-joined with newline per SSE spec. `id:` captured if present.

import { useEffect, useRef, useState } from "react"

export type SSEStatus = "idle" | "connecting" | "streaming" | "closed" | "error"

export interface SSEEvent {
  event: string
  data: string
  id?: string
}

export interface SSEState {
  events: SSEEvent[]
  status: SSEStatus
  error: Error | null
  abort: () => void
}

export interface UseSSEOptions {
  enabled?: boolean
  method?: "GET" | "POST"
  body?: unknown
  onEvent?: (e: SSEEvent) => void
}

export function useSSE(url: string, opts: UseSSEOptions = {}): SSEState {
  const enabled = opts.enabled ?? true
  const method = opts.method ?? "GET"

  // Refs so body / onEvent updates don't re-trigger the effect; captured
  // at start-time inside streamEvents.
  const bodyRef = useRef<unknown>(opts.body)
  const onEventRef = useRef<((e: SSEEvent) => void) | undefined>(opts.onEvent)
  bodyRef.current = opts.body
  onEventRef.current = opts.onEvent

  const controllerRef = useRef<AbortController | null>(null)
  const abort = useRef((): void => { controllerRef.current?.abort() }).current

  const [state, setState] = useState<SSEState>({
    events: [],
    status: "idle",
    error: null,
    abort,
  })

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ events: [], status: "connecting", error: null, abort })

    streamEvents(url, method, bodyRef.current, controller.signal, (event) => {
      if (controller.signal.aborted) return
      onEventRef.current?.(event)
      setState((prev) => ({
        ...prev,
        events: [...prev.events, event],
        status: "streaming",
        error: null,
      }))
    })
      .then(() => {
        if (controller.signal.aborted) return
        setState((prev) => ({ ...prev, status: "closed" }))
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err : new Error(String(err))
        setState((prev) => ({ ...prev, status: "error", error }))
      })

    return () => { controller.abort() }
  }, [url, enabled, method, abort])

  return state
}

async function streamEvents(
  url: string,
  method: "GET" | "POST",
  body: unknown,
  signal: AbortSignal,
  onEvent: (e: SSEEvent) => void,
): Promise<void> {
  const headers: Record<string, string> = { Accept: "text/event-stream" }
  const init: RequestInit = { method, headers, signal }
  if (method === "POST") {
    headers["Content-Type"] = "application/json"
    init.body = JSON.stringify(body ?? {})
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    const detail = await readErrorDetail(res)
    throw new Error(`SSE HTTP ${res.status}${detail}`)
  }
  if (!res.body) throw new Error("No SSE body stream")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (!signal.aborted) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const chunks = buffer.split("\n\n")
    buffer = chunks.pop() ?? ""
    for (const raw of chunks) {
      const parsed = parseEvent(raw)
      if (parsed !== null) onEvent(parsed)
    }
  }
}

async function readErrorDetail(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") ?? ""
  if (!ct.includes("application/json")) return ""
  try {
    const payload = (await res.json()) as { message?: string }
    return payload.message !== undefined ? `: ${payload.message}` : ""
  } catch {
    return ""
  }
}

function parseEvent(raw: string): SSEEvent | null {
  if (!raw.trim()) return null
  let event = "message"
  let data = ""
  let id: string | undefined
  for (const line of raw.split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const field = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trimStart()
    if (field === "event") event = value
    else if (field === "data") data = data === "" ? value : `${data}\n${value}`
    else if (field === "id") id = value
  }
  if (data === "") return null
  return id !== undefined ? { event, data, id } : { event, data }
}
