// Fetch-based SSE hook with AbortController cleanup. Phase 1 ships the
// parser wired; Phase 3 workflow-runs UX will consume it. Chosen over
// EventSource to support POST triggers + custom headers in Phase 3.
//
// Wire format parsed: `event: <name>\ndata: <string>\n\n`. Multi-line
// data is re-joined with newline per SSE spec. `id:` captured if present.

import { useEffect, useState } from "react"

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
}

export interface UseSSEOptions {
  enabled?: boolean
}

export function useSSE(url: string, opts: UseSSEOptions = {}): SSEState {
  const enabled = opts.enabled ?? true
  const [state, setState] = useState<SSEState>({
    events: [],
    status: "idle",
    error: null,
  })

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    setState({ events: [], status: "connecting", error: null })

    streamEvents(url, controller.signal, (event) => {
      if (controller.signal.aborted) return
      setState((prev) => ({
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
  }, [url, enabled])

  return state
}

async function streamEvents(
  url: string,
  signal: AbortSignal,
  onEvent: (e: SSEEvent) => void,
): Promise<void> {
  const res = await fetch(url, {
    headers: { Accept: "text/event-stream" },
    signal,
  })
  if (!res.ok) throw new Error(`SSE HTTP ${res.status}`)
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
