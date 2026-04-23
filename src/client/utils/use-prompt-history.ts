// Phase 5 Step 5b (Session #27b) — PromptLab sidebar data hook.
//
// Lightweight fetch against `/api/assets/:id/prompt-history`. Exposes a
// `refresh()` imperative so the parent page can re-pull after a new edit
// lands via SSE (optimistic append would be a nice-to-have but a 1-round
// refetch after `complete` is simpler and matches the server's denormalized
// costUsd / resultAssetId fields).

import { useCallback, useEffect, useState } from "react"

import type { PromptHistoryDto } from "@/core/dto/prompt-history-dto"
import { apiGet, type ApiError } from "@/client/api/client"

export interface PromptHistoryState {
  data: PromptHistoryDto[]
  loading: boolean
  error: ApiError | Error | null
  refresh: () => void
}

interface ListResponse {
  assetId: string
  history: PromptHistoryDto[]
}

export function usePromptHistory(assetId: string | null): PromptHistoryState {
  const [data, setData] = useState<PromptHistoryDto[]>([])
  const [loading, setLoading] = useState<boolean>(assetId !== null)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [nonce, setNonce] = useState<number>(0)

  useEffect(() => {
    if (assetId === null) {
      setData([])
      setLoading(false)
      setError(null)
      return undefined
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    apiGet<ListResponse>(
      `/api/assets/${assetId}/prompt-history?_=${nonce}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (controller.signal.aborted) return
        setData(res.history)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [assetId, nonce])

  const refresh = useCallback((): void => {
    setNonce((n) => n + 1)
  }, [])

  return { data, loading, error, refresh }
}
