// React hooks for API calls. Phase 1 ships only useApiHealth (one-shot fetch
// on mount + AbortController cleanup). Phase 3 will add SSE-backed hooks for
// workflow runs, and a richer pattern (react-query?) may land then.

import { useEffect, useState } from "react"
import type { ApiError } from "./client"
import { apiGet } from "./client"

export interface HealthData {
  status: "ok"
  version: string
  uptimeMs: number
}

export interface ApiState<T> {
  data: T | null
  error: ApiError | Error | null
  loading: boolean
}

export function useApiHealth(): ApiState<HealthData> {
  const [state, setState] = useState<ApiState<HealthData>>({
    data: null,
    error: null,
    loading: true,
  })

  useEffect(() => {
    const controller = new AbortController()
    apiGet<HealthData>("/api/health", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setState({ data, error: null, loading: false })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err : new Error(String(err))
        setState({ data: null, error, loading: false })
      })
    return () => { controller.abort() }
  }, [])

  return state
}
