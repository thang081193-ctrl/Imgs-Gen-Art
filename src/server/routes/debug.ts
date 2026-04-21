// Dev-only debug endpoints. Phase 1 hosts only /sse-echo — a minimal SSE
// scaffold that proves streamSSE wiring + abort propagation. Phase 3
// workflow dispatcher will reuse the same abort pattern.

import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

const TICK_COUNT = 3
const TICK_INTERVAL_MS = 200

export function createDebugRoute(): Hono {
  const route = new Hono()

  route.get("/sse-echo", (c) => {
    return streamSSE(c, async (stream) => {
      for (let i = 0; i < TICK_COUNT; i++) {
        if (c.req.raw.signal.aborted) return
        await stream.writeSSE({
          event: "tick",
          data: JSON.stringify({ tick: i, timestamp: Date.now() }),
        })
        await stream.sleep(TICK_INTERVAL_MS)
      }
    })
  })

  return route
}
