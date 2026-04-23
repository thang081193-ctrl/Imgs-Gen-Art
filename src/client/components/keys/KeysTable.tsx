// Per-provider key slot table. Shows label + added/lastUsed + active badge
// + Test button + Activate/Delete actions. Active row gets an accent border.
// Bonus B: amber warning banner when slots>0 but activeSlotId=null.
// Bonus C: delete confirm reuses ConfirmDialog (extra copy if the slot is active).

import { useState } from "react"
import type { ReactElement } from "react"
import type { KeySlotDto, VertexSlotDto } from "@/core/dto/key-dto"
import { ConfirmDialog } from "@/client/components/ConfirmDialog"
import { TestButton } from "./TestButton"
import { activateKey, deleteKey } from "@/client/api/hooks"
import { ApiError } from "@/client/api/client"
import type { ShowToast } from "@/client/components/ToastHost"

export type Provider = "gemini" | "vertex"

interface RowBase {
  id: string
  label: string
  addedAt: string
  lastUsedAt?: string
}

export interface KeysTableProps {
  provider: Provider
  activeSlotId: string | null
  slots: ReadonlyArray<KeySlotDto | VertexSlotDto>
  showToast: ShowToast
  onMutated: () => void
  onAddClick: () => void
}

export function KeysTable({
  provider,
  activeSlotId,
  slots,
  showToast,
  onMutated,
  onAddClick,
}: KeysTableProps): ReactElement {
  const [pendingDelete, setPendingDelete] = useState<RowBase | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const title = provider === "gemini" ? "Gemini" : "Vertex"
  const empty = slots.length === 0
  const hasOrphanedSlots = !empty && activeSlotId === null

  async function handleActivate(slotId: string): Promise<void> {
    if (busyId !== null) return
    setBusyId(slotId)
    try {
      await activateKey(slotId)
      onMutated()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Activate failed"
      showToast({ message: `Activate failed: ${msg}`, variant: "danger" })
    } finally {
      setBusyId(null)
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (pendingDelete === null) return
    const slotId = pendingDelete.id
    setPendingDelete(null)
    setBusyId(slotId)
    try {
      const res = await deleteKey(slotId)
      if (res?.warning) {
        showToast({ message: res.warning, variant: "warning" })
      }
      onMutated()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Delete failed"
      showToast({ message: `Delete failed: ${msg}`, variant: "danger" })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/50">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <p className="text-xs text-slate-500">
            {empty ? "No slots" : `${slots.length} slot${slots.length === 1 ? "" : "s"}`}
            {activeSlotId !== null && ` · active: ${activeSlotId.slice(0, 12)}…`}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddClick}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Add {title} key
        </button>
      </header>

      {empty && (
        <div className="px-4 py-6 text-center text-sm text-slate-500">
          No {title} keys yet. Click <span className="font-medium text-slate-300">Add {title} key</span> to start.
        </div>
      )}

      {hasOrphanedSlots && (
        <div className="mx-4 mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          No active {title} key. Activate one below before running a workflow.
        </div>
      )}

      {!empty && (
        <ul className="divide-y divide-slate-800">
          {slots.map((slot) => {
            const active = activeSlotId === slot.id
            const isVertex = provider === "vertex"
            const vslot = isVertex ? (slot as VertexSlotDto) : null
            return (
              <li
                key={slot.id}
                className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                  active ? "bg-indigo-500/5 border-l-4 border-l-indigo-500" : "border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-100">{slot.label}</span>
                    {active && (
                      <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 font-mono truncate">{slot.id}</p>
                  {vslot !== null && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {vslot.projectId} · {vslot.location}
                      {!vslot.hasCredentials && (
                        <span className="ml-2 text-red-400">⚠ credentials file missing</span>
                      )}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    added {new Date(slot.addedAt).toLocaleString()}
                    {slot.lastUsedAt !== undefined && ` · last used ${new Date(slot.lastUsedAt).toLocaleString()}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <TestButton slotId={slot.id} showToast={showToast} />
                  {!active && (
                    <button
                      type="button"
                      onClick={() => handleActivate(slot.id)}
                      disabled={busyId === slot.id}
                      className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                    >
                      {busyId === slot.id ? "…" : "Activate"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingDelete({ id: slot.id, label: slot.label, addedAt: slot.addedAt })}
                    disabled={busyId === slot.id}
                    className="rounded-md border border-red-500/40 bg-transparent px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete key slot"
        body={
          pendingDelete === null
            ? ""
            : activeSlotId === pendingDelete.id
              ? `Delete active slot "${pendingDelete.label}"? Provider will have no active key until you activate another.`
              : `Delete slot "${pendingDelete.label}"?`
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  )
}
