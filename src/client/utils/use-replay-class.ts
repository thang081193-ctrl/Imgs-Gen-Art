// Session #26 (Phase 5 Step 2) — probes /api/assets/:id/replay-class to drive
// the AssetDetailModal Replay button state. Q4 decision: replay class is
// immutable per asset, so cache indefinitely (module-scoped Map). No React
// Query dep in this project — simple Map keyed by assetId is enough.
//
// Response is a discriminated union on `replayClass`:
//   - "deterministic" | "best_effort" → has estimatedCostUsd
//   - "not_replayable"                → has reason (drives tooltip copy)

import { useEffect, useState } from "react"

import type { NotReplayableReason } from "@/core/dto/asset-dto"

import { ApiError, apiGet } from "@/client/api/client"

export type ReplayClassProbe =
  | {
      assetId: string
      replayClass: "deterministic" | "best_effort"
      providerId: string
      modelId: string
      estimatedCostUsd: number
      workflowId: string
    }
  | {
      assetId: string
      replayClass: "not_replayable"
      reason: NotReplayableReason
      providerId: string
      modelId: string
      workflowId: string
    }

const probeCache = new Map<string, ReplayClassProbe>()

export interface UseReplayClassResult {
  data: ReplayClassProbe | null
  error: ApiError | Error | null
  loading: boolean
}

export function useReplayClass(assetId: string | null): UseReplayClassResult {
  const cached = assetId !== null ? probeCache.get(assetId) ?? null : null
  const [state, setState] = useState<UseReplayClassResult>({
    data: cached,
    error: null,
    loading: assetId !== null && cached === null,
  })

  useEffect(() => {
    if (assetId === null) {
      setState({ data: null, error: null, loading: false })
      return undefined
    }
    const hit = probeCache.get(assetId)
    if (hit !== undefined) {
      setState({ data: hit, error: null, loading: false })
      return undefined
    }
    const controller = new AbortController()
    setState({ data: null, error: null, loading: true })
    apiGet<ReplayClassProbe>(`/api/assets/${assetId}/replay-class`, {
      signal: controller.signal,
    })
      .then((probe) => {
        if (controller.signal.aborted) return
        probeCache.set(assetId, probe)
        setState({ data: probe, error: null, loading: false })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err : new Error(String(err))
        setState({ data: null, error, loading: false })
      })
    return () => {
      controller.abort()
    }
  }, [assetId])

  return state
}

// Test helper — reset the module cache between tests.
export function _resetReplayClassCacheForTests(): void {
  probeCache.clear()
}
