// Session #34 F1 — React hook wrapping DELETE /api/assets/:id.
// Exposes single `mutate(id)` for AssetDetailModal and `mutateMany(ids)`
// for Google-style bulk-select in Gallery. Bulk path runs concurrently
// via Promise.allSettled so one 4xx doesn't sink the rest — caller gets
// an `{ ok, failed }` split and surfaces partial failure via toast.

import { useCallback, useState } from "react"
import { apiDelete } from "@/client/api/client"

export interface BulkDeleteResult {
  ok: string[]
  failed: { id: string; error: Error }[]
}

export interface UseDeleteAsset {
  mutate: (id: string) => Promise<void>
  mutateMany: (ids: string[]) => Promise<BulkDeleteResult>
  loading: boolean
  error: Error | null
}

export function useDeleteAsset(): UseDeleteAsset {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = useCallback(async (id: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await apiDelete(`/api/assets/${encodeURIComponent(id)}`)
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const mutateMany = useCallback(async (ids: string[]): Promise<BulkDeleteResult> => {
    setLoading(true)
    setError(null)
    const settled = await Promise.allSettled(
      ids.map((id) => apiDelete(`/api/assets/${encodeURIComponent(id)}`)),
    )
    const ok: string[] = []
    const failed: { id: string; error: Error }[] = []
    settled.forEach((r, i) => {
      const id = ids[i] as string
      if (r.status === "fulfilled") ok.push(id)
      else {
        const e = r.reason instanceof Error ? r.reason : new Error(String(r.reason))
        failed.push({ id, error: e })
      }
    })
    setLoading(false)
    if (failed.length > 0 && ok.length === 0) {
      setError(failed[0]!.error)
    }
    return { ok, failed }
  }, [])

  return { mutate, mutateMany, loading, error }
}
