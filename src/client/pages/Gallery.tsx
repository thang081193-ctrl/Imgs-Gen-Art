// Gallery page — filter bar + chips row + grid + modal + pagination. Default
// sort createdAt DESC (server-side).
//
// Session #29 Step 3b: filter state = one `AssetListFilter` (expanded — 8
// dimensions). URL ↔ filter round-trip via `AssetListFilterSchema.safeParse`
// on mount + `history.replaceState` on change. The navigator's `batchId`
// deep-link continues to seed the filter on initial mount.

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactElement } from "react"
import {
  buildAssetsQueryString,
  useAssets,
  useProfiles,
  useProviders,
  useWorkflows,
} from "@/client/api/hooks"
import { AssetFilterBar } from "@/client/components/AssetFilterBar"
import { AssetFilterChips } from "@/client/components/AssetFilterChips"
import type { AssetFilterDimension } from "@/client/components/AssetFilterChips"
import { AssetThumbnail } from "@/client/components/AssetThumbnail"
import { AssetDetailModal } from "@/client/components/AssetDetailModal"
import { GalleryEmptyState } from "@/client/components/GalleryEmptyState"
import type { AssetDto } from "@/core/dto/asset-dto"
import type { AssetListFilter } from "@/core/schemas/asset-list-filter"
import { emptyAssetListFilter } from "@/core/schemas/asset-list-filter"
import type { Navigator } from "@/client/navigator"
import type { ShowToast } from "@/client/components/ToastHost"
import { formatCost } from "@/client/utils/format"
import {
  decodeGalleryFilter,
  hasAnyFilter,
  stripPagination,
} from "@/client/utils/gallery-filter-url"

const PAGE_SIZE = 50

export interface GalleryPageProps {
  navigator: Navigator
  showToast: ShowToast
}

export function Gallery({ navigator, showToast }: GalleryPageProps): ReactElement {
  const [filter, setFilter] = useState<AssetListFilter>(() => {
    const fromUrl = decodeGalleryFilter(typeof window !== "undefined" ? window.location.search : "")
    if (hasAnyFilter(fromUrl)) return fromUrl
    const base = emptyAssetListFilter()
    if (navigator.params.batchId !== undefined) return { ...base, batchId: navigator.params.batchId }
    if (navigator.params.profileIds !== undefined) return { ...base, profileIds: navigator.params.profileIds }
    return base
  })
  const [page, setPage] = useState<number>(0)
  const [selected, setSelected] = useState<AssetDto | null>(null)

  // URL sync — strip limit/offset so pagination doesn't leak into the bar.
  useEffect(() => {
    if (typeof window === "undefined") return
    const encoded = buildAssetsQueryString({
      ...filter,
      limit: undefined,
      offset: undefined,
    })
    const trimmed = stripPagination(encoded)
    const newUrl = trimmed ? `${window.location.pathname}?${trimmed}` : window.location.pathname
    window.history.replaceState(null, "", newUrl)
  }, [filter])

  // Reset page when filter narrows (any filter change).
  useEffect(() => { setPage(0) }, [filter])

  // Honor navigator.params.batchId updates after mount (e.g. Workflow page
  // toast CTA re-enters Gallery with a new batchId).
  useEffect(() => {
    if (navigator.params.batchId !== undefined && navigator.params.batchId !== filter.batchId) {
      setFilter((f) => ({ ...f, batchId: navigator.params.batchId }))
    }
  }, [navigator.params.batchId, filter.batchId])

  // Honor navigator.params.profileIds updates after mount (Session #30
  // F6 DeleteProfileDialog "View in Gallery" deep-link).
  useEffect(() => {
    const incoming = navigator.params.profileIds
    if (incoming === undefined) return
    const current = filter.profileIds ?? []
    const same = incoming.length === current.length && incoming.every((id, i) => id === current[i])
    if (!same) setFilter((f) => ({ ...f, profileIds: incoming }))
  }, [navigator.params.profileIds, filter.profileIds])

  const onChangeFilter = useCallback((patch: Partial<AssetListFilter>) => {
    setFilter((f) => ({ ...f, ...patch }))
  }, [])

  const clearDimension = (d: AssetFilterDimension): void => {
    onChangeFilter({ [d]: undefined } as Partial<AssetListFilter>)
  }
  const clearAll = (): void => { setFilter(emptyAssetListFilter()) }

  const profilesQ = useProfiles()
  const workflowsQ = useWorkflows()
  const providersQ = useProviders()
  const assetsQ = useAssets({ ...filter, limit: PAGE_SIZE, offset: page * PAGE_SIZE })

  const assets = assetsQ.data?.assets ?? []
  const profiles = profilesQ.data?.profiles ?? []
  const workflows = workflowsQ.data?.workflows ?? []
  const providers = providersQ.data?.providers ?? []
  const models = providersQ.data?.models ?? []
  const filterActive = hasAnyFilter(filter)
  const batchNotFound = filter.batchId !== undefined && !assetsQ.loading && assets.length === 0 && page === 0
  const pageCostTotal = useMemo(
    () => assets.reduce((sum, a) => sum + (a.costUsd ?? 0), 0),
    [assets],
  )

  const openSourceAsset = (sourceId: string): void => {
    const match = assets.find((a) => a.id === sourceId)
    if (match !== undefined) setSelected(match)
    else {
      showToast({
        variant: "info",
        message: `Source asset ${sourceId} not in current view. Clear filters or search by id.`,
      })
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Gallery</h1>
        <p className="text-xs text-slate-500">
          Sorted by created_at DESC · page {page + 1}
          {pageCostTotal > 0 && (
            <>
              {" "}· page total{" "}
              <span className="font-mono text-slate-300">
                {formatCost(pageCostTotal, "aggregate")}
              </span>
            </>
          )}
        </p>
      </header>

      <AssetFilterBar
        filter={filter}
        profiles={profiles}
        workflows={workflows}
        providers={providers}
        models={models}
        onChange={onChangeFilter}
        showToast={showToast}
        batchNotFound={batchNotFound}
      />
      <AssetFilterChips
        filter={filter}
        profiles={profiles}
        workflows={workflows}
        providers={providers}
        models={models}
        onClearDimension={clearDimension}
        onClearAll={clearAll}
      />

      {assetsQ.loading && <p className="text-sm text-slate-500">Loading assets…</p>}
      {assetsQ.error !== null && (
        <p className="text-sm text-red-400">Failed to load assets: {assetsQ.error.message}</p>
      )}
      {!assetsQ.loading && assets.length === 0 && !batchNotFound && (
        filterActive ? <GalleryEmptyState onClearAll={clearAll} /> : <EmptyGallery />
      )}

      {assets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {assets.map((a) => (
            <AssetThumbnail
              key={a.id}
              asset={a}
              onSelect={setSelected}
              onOpenSource={openSourceAsset}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        currentCount={assets.length}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />

      <AssetDetailModal
        asset={selected}
        onClose={() => setSelected(null)}
        onFilterBatch={(id) => {
          onChangeFilter({ batchId: id })
          setSelected(null)
        }}
        onOpenAsset={setSelected}
        onEditAsset={(a) => {
          setSelected(null)
          navigator.go("prompt-lab", { assetId: a.id })
        }}
        showToast={showToast}
      />
    </main>
  )
}

function EmptyGallery(): ReactElement {
  return (
    <div className="rounded-md border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
      No assets yet. Run a workflow from the Workflow page to populate the gallery.
    </div>
  )
}

function Pagination({
  page, pageSize, currentCount, onPrev, onNext,
}: {
  page: number
  pageSize: number
  currentCount: number
  onPrev: () => void
  onNext: () => void
}): ReactElement {
  const hasMore = currentCount === pageSize
  return (
    <div className="flex items-center justify-between text-xs text-slate-400">
      <button
        type="button"
        disabled={page === 0}
        onClick={onPrev}
        className="rounded-md bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ← Prev
      </button>
      <span>
        {currentCount === 0 ? "no results" : `showing ${currentCount} item(s)`}
      </span>
      <button
        type="button"
        disabled={!hasMore}
        onClick={onNext}
        className="rounded-md bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next →
      </button>
    </div>
  )
}
