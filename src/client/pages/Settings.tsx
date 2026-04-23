// Settings page — Phase 4 Step 3. Key management only for now;
// Phase 4 later sessions wire provider health + cost summaries.
// BONUS A: refreshKey bump drives useKeys re-fetch on any mutation.

import { useState } from "react"
import type { ReactElement } from "react"
import { useKeys } from "@/client/api/hooks"
import { KeysTable } from "@/client/components/keys/KeysTable"
import { KeyAddModalGemini } from "@/client/components/keys/KeyAddModalGemini"
import { KeyAddModalVertex } from "@/client/components/keys/KeyAddModalVertex"
import type { ShowToast } from "@/client/components/ToastHost"

export interface SettingsProps {
  showToast: ShowToast
}

export function Settings({ showToast }: SettingsProps): ReactElement {
  const [refreshKey, setRefreshKey] = useState(0)
  const [addOpen, setAddOpen] = useState<"gemini" | "vertex" | null>(null)
  const bumpRefresh = (): void => setRefreshKey((k) => k + 1)
  const keys = useKeys(refreshKey)

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400">
          Manage provider credentials. Added keys are stored encrypted on disk; the raw value is never shown back.
        </p>
      </header>

      {keys.loading && (
        <div className="rounded border border-slate-800 bg-slate-900 px-4 py-6 text-sm text-slate-400">
          Loading keys…
        </div>
      )}

      {keys.error !== null && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Failed to load keys: {keys.error.message}
        </div>
      )}

      {keys.data !== null && (
        <div className="flex flex-col gap-6">
          <KeysTable
            provider="gemini"
            activeSlotId={keys.data.gemini.activeSlotId}
            slots={keys.data.gemini.slots}
            showToast={showToast}
            onMutated={bumpRefresh}
            onAddClick={() => setAddOpen("gemini")}
          />
          <KeysTable
            provider="vertex"
            activeSlotId={keys.data.vertex.activeSlotId}
            slots={keys.data.vertex.slots}
            showToast={showToast}
            onMutated={bumpRefresh}
            onAddClick={() => setAddOpen("vertex")}
          />
        </div>
      )}

      <KeyAddModalGemini
        open={addOpen === "gemini"}
        onClose={() => setAddOpen(null)}
        onCreated={(slotId) => {
          bumpRefresh()
          showToast({ message: `Gemini slot created (${slotId.slice(0, 8)}…). Click Activate to make it live.`, variant: "success" })
        }}
      />
      <KeyAddModalVertex
        open={addOpen === "vertex"}
        onClose={() => setAddOpen(null)}
        onCreated={(slotId) => {
          bumpRefresh()
          showToast({ message: `Vertex slot created (${slotId.slice(0, 8)}…). Click Activate to make it live.`, variant: "success" })
        }}
      />
    </main>
  )
}
