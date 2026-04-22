// Gallery page — filter + grid + modal + pagination. Default sort
// createdAt DESC (server-side). Filters: profile (dropdown), workflow
// (color-coded chips), batchId (exact-match text input). Pagination 50/page.
//
// Deep-link from Workflow page toast: navigator.params.batchId → initial
// filter; URL is ephemeral but batchId filter persists in Gallery state
// until manually cleared.

import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import { useAssets, useProfiles, useWorkflows } from "@/client/api/hooks"
import { AssetFilterBar } from "@/client/components/AssetFilterBar"
import { AssetThumbnail } from "@/client/components/AssetThumbnail"
import { AssetDetailModal } from "@/client/components/AssetDetailModal"
import type { AssetDto } from "@/core/dto/asset-dto"
import type { WorkflowId } from "@/core/design/types"
import type { Navigator } from "@/client/navigator"
import type { ShowToast } from "@/client/components/ToastHost"

const PAGE_SIZE = 50

export interface GalleryPageProps {
  navigator: Navigator
  showToast: ShowToast
}

export function Gallery({ navigator }: GalleryPageProps): ReactElement {
  const [profileId, setProfileId] = useState<string | null>(null)
  const [workflowId, setWorkflowId] = useState<WorkflowId | null>(null)
  const [batchId, setBatchId] = useState<string | null>(navigator.params.batchId ?? null)
  const [page, setPage] = useState<number>(0)
  const [selected, setSelected] = useState<AssetDto | null>(null)

  // Reset page when filters change so we don't sit on empty page 3.
  useEffect(() => {
    setPage(0)
  }, [profileId, workflowId, batchId])

  const profilesQ = useProfiles()
  const workflowsQ = useWorkflows()
  const assetsQ = useAssets({
    ...(profileId !== null ? { profileId } : {}),
    ...(workflowId !== null ? { workflowId } : {}),
    ...(batchId !== null ? { batchId } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const assets = assetsQ.data?.assets ?? []
  const profiles = profilesQ.data?.profiles ?? []
  const workflows = workflowsQ.data?.workflows ?? []
  const batchNotFound = batchId !== null && !assetsQ.loading && assets.length === 0 && page === 0

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Gallery</h1>
        <p className="text-xs text-slate-500">Sorted by created_at DESC · page {page + 1}</p>
      </header>

      <AssetFilterBar
        profiles={profiles}
        workflows={workflows}
        profileId={profileId}
        workflowId={workflowId}
        batchId={batchId}
        onProfileChange={setProfileId}
        onWorkflowChange={setWorkflowId}
        onBatchIdChange={setBatchId}
        batchNotFound={batchNotFound}
      />

      {assetsQ.loading && <p className="text-sm text-slate-500">Loading assets…</p>}
      {assetsQ.error !== null && (
        <p className="text-sm text-red-400">Failed to load assets: {assetsQ.error.message}</p>
      )}
      {!assetsQ.loading && assets.length === 0 && !batchNotFound && (
        <EmptyGallery />
      )}

      {assets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {assets.map((a) => (
            <AssetThumbnail key={a.id} asset={a} onSelect={setSelected} />
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
          setBatchId(id)
          setSelected(null)
        }}
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
  page,
  pageSize,
  currentCount,
  onPrev,
  onNext,
}: {
  page: number
  pageSize: number
  currentCount: number
  onPrev: () => void
  onNext: () => void
}): ReactElement {
  // We don't know total count (server doesn't return it); gate "Next" via
  // currentCount === pageSize heuristic (if full page, probably more).
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
