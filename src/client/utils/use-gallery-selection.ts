// Session #34 F1b — Gallery bulk-select state + bulk delete flow.
// Extracted from Gallery.tsx to keep the page under the 300-LOC cap.
// Owns: the selection Set, the bulk ConfirmDialog open flag, the
// `use-delete-asset` hook, the refreshKey that invalidates `useAssets`,
// and the "Select all on page" toggle — all derived from the page's
// current asset id list which the caller passes in.

import { useCallback, useMemo, useState } from "react"
import type { ShowToast } from "@/client/components/ToastHost"
import { useDeleteAsset } from "@/client/utils/use-delete-asset"

export interface UseGallerySelection {
  refreshKey: number
  bumpRefresh: () => void
  pickedIds: Set<string>
  togglePick: (id: string) => void
  dropPick: (id: string) => void
  clearSelection: () => void
  selectionActive: boolean
  allOnPageSelected: boolean
  togglePageSelection: () => void
  bulkConfirmOpen: boolean
  openBulkConfirm: () => void
  closeBulkConfirm: () => void
  deleting: boolean
  runBulkDelete: () => void
}

export function useGallerySelection(
  pageAssetIds: string[],
  showToast: ShowToast,
): UseGallerySelection {
  const [refreshKey, setRefreshKey] = useState(0)
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set())
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const del = useDeleteAsset()

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  const clearSelection = useCallback(() => setPickedIds(new Set()), [])
  const openBulkConfirm = useCallback(() => setBulkConfirmOpen(true), [])
  const closeBulkConfirm = useCallback(() => setBulkConfirmOpen(false), [])

  const togglePick = useCallback((id: string) => {
    setPickedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const dropPick = useCallback((id: string) => {
    setPickedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const allOnPageSelected = useMemo(
    () => pageAssetIds.length > 0 && pageAssetIds.every((id) => pickedIds.has(id)),
    [pageAssetIds, pickedIds],
  )

  const togglePageSelection = useCallback(() => {
    setPickedIds((prev) => {
      if (pageAssetIds.length === 0) return prev
      const next = new Set(prev)
      const addAll = !pageAssetIds.every((id) => next.has(id))
      if (addAll) pageAssetIds.forEach((id) => next.add(id))
      else pageAssetIds.forEach((id) => next.delete(id))
      return next
    })
  }, [pageAssetIds])

  const runBulkDelete = useCallback(() => {
    const ids = Array.from(pickedIds)
    void del.mutateMany(ids).then((result) => {
      setBulkConfirmOpen(false)
      clearSelection()
      setRefreshKey((k) => k + 1)
      if (result.ok.length > 0 && result.failed.length === 0) {
        showToast({
          variant: "success",
          message: `Deleted ${result.ok.length} asset${result.ok.length === 1 ? "" : "s"}.`,
        })
      } else if (result.ok.length > 0 && result.failed.length > 0) {
        showToast({
          variant: "info",
          message: `Deleted ${result.ok.length}, ${result.failed.length} failed.`,
        })
      } else {
        showToast({
          variant: "danger",
          message: `Delete failed: ${result.failed[0]?.error.message ?? "unknown"}`,
        })
      }
    })
  }, [pickedIds, del, clearSelection, showToast])

  return {
    refreshKey,
    bumpRefresh,
    pickedIds,
    togglePick,
    dropPick,
    clearSelection,
    selectionActive: pickedIds.size > 0,
    allOnPageSelected,
    togglePageSelection,
    bulkConfirmOpen,
    openBulkConfirm,
    closeBulkConfirm,
    deleting: del.loading,
    runBulkDelete,
  }
}
