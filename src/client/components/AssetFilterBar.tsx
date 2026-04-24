// Phase 5 Step 3b (Session #29) — expanded Gallery filter bar. Eight
// dimensions; each section is wrapped in `id="filter-<schemaKey>"` +
// `tabIndex={-1}` so AssetFilterChips can scroll + flash + focus it.
//
// Single `onChange(patch)` callback keeps the prop surface flat. Provider →
// Model cascade (Q-29.D) lives here because it reads the model registry;
// toast emits once per reduction.
//
// Subcomponents: FilterBarTagsSection, FilterBarEnumSections (Date / Replay /
// MultiCheckbox). Kept inline here: Profile, Batch, Workflow — small +
// single-use.

import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import { COLOR_CLASSES } from "@/core/design"
import type { AssetListFilter } from "@/core/schemas/asset-list-filter"
import type { ProfileSummaryDto } from "@/core/dto/profile-dto"
import type { ModelInfo, ProviderInfo } from "@/core/model-registry/types"
import type { WorkflowSummary } from "@/client/api/hooks"
import type { WorkflowId } from "@/core/design/types"
import type { ShowToast } from "./ToastHost"
import { FilterBarTagsSection } from "./FilterBarTagsSection"
import {
  DateSection,
  MultiCheckboxSection,
  ReplayClassSection,
} from "./FilterBarEnumSections"

export interface AssetFilterBarProps {
  filter: AssetListFilter
  profiles: ProfileSummaryDto[]
  workflows: WorkflowSummary[]
  providers: ProviderInfo[]
  models: ModelInfo[]
  onChange: (patch: Partial<AssetListFilter>) => void
  showToast: ShowToast
  batchNotFound?: boolean
}

export function AssetFilterBar(props: AssetFilterBarProps): ReactElement {
  const { filter, profiles, workflows, providers, models, onChange, showToast } = props

  const setSingle = <K extends keyof AssetListFilter>(key: K, value: AssetListFilter[K]): void => {
    onChange({ [key]: value } as Partial<AssetListFilter>)
  }

  const onProvidersChange = (next: string[]): void => {
    const patch: Partial<AssetListFilter> = {
      providerIds: next.length > 0 ? next : undefined,
    }
    const currentModels = filter.modelIds ?? []
    if (currentModels.length > 0 && next.length > 0) {
      const valid = new Set(models.filter((m) => next.includes(m.providerId)).map((m) => m.id))
      const filtered = currentModels.filter((id) => valid.has(id))
      if (filtered.length < currentModels.length) {
        showToast({
          variant: "info",
          message: "Model filter updated — removed models not offered by selected provider(s).",
        })
        patch.modelIds = filtered.length > 0 ? filtered : undefined
      }
    }
    onChange(patch)
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ProfileSection
          value={filter.profileIds?.[0] ?? null}
          profiles={profiles}
          onChange={(id) => setSingle("profileIds", id ? [id] : undefined)}
        />
        <BatchSection
          value={filter.batchId ?? null}
          batchNotFound={props.batchNotFound === true}
          onChange={(id) => setSingle("batchId", id ?? undefined)}
        />
      </div>

      <WorkflowSection
        value={(filter.workflowIds?.[0] ?? null) as WorkflowId | null}
        workflows={workflows}
        onChange={(id) => setSingle("workflowIds", id ? [id] : undefined)}
      />

      <FilterBarTagsSection
        tags={filter.tags}
        matchMode={filter.tagMatchMode}
        onChange={onChange}
        showToast={showToast}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DateSection
          preset={filter.datePreset}
          dateFrom={filter.dateFrom}
          dateTo={filter.dateTo}
          onChange={onChange}
        />
        <ReplayClassSection
          value={filter.replayClasses}
          onChange={(next) => setSingle("replayClasses", next)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MultiCheckboxSection
          id="filter-providerIds"
          title="Provider"
          items={providers.map((p) => ({ id: p.id, label: p.displayName }))}
          value={filter.providerIds ?? []}
          onChange={onProvidersChange}
        />
        <MultiCheckboxSection
          id="filter-modelIds"
          title="Model"
          items={visibleModels(models, filter.providerIds)}
          value={filter.modelIds ?? []}
          onChange={(next) => setSingle("modelIds", next.length > 0 ? next : undefined)}
          emptyHint="Select a provider to narrow models."
        />
      </div>
    </div>
  )
}

function visibleModels(
  models: ModelInfo[],
  providerIds: string[] | undefined,
): { id: string; label: string }[] {
  const scoped = providerIds && providerIds.length > 0
    ? models.filter((m) => providerIds.includes(m.providerId))
    : models
  return scoped.map((m) => ({ id: m.id, label: m.displayName }))
}

function ProfileSection({
  value, profiles, onChange,
}: {
  value: string | null
  profiles: ProfileSummaryDto[]
  onChange: (id: string | null) => void
}): ReactElement {
  return (
    <label id="filter-profileIds" tabIndex={-1} className="block text-xs text-slate-400 space-y-1 outline-none">
      <span>Profile</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="input">
        <option value="">All profiles</option>
        {profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
      </select>
    </label>
  )
}

function BatchSection({
  value, batchNotFound, onChange,
}: {
  value: string | null
  batchNotFound: boolean
  onChange: (id: string | null) => void
}): ReactElement {
  const [draft, setDraft] = useState<string>(value ?? "")
  useEffect(() => { setDraft(value ?? "") }, [value])
  const commit = (): void => {
    const v = draft.trim()
    onChange(v === "" ? null : v)
  }
  return (
    <label id="filter-batchId" tabIndex={-1} className="block text-xs text-slate-400 space-y-1 md:col-span-2 outline-none">
      <span>Batch ID (exact match)</span>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit() }}
          placeholder="e.g. batch_xyz1234abc"
          className="input flex-1"
        />
        {value !== null && (
          <button
            type="button"
            onClick={() => { setDraft(""); onChange(null) }}
            className="rounded-md bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
          >
            Clear
          </button>
        )}
      </div>
      {batchNotFound && <p className="text-xs text-yellow-400">Batch not found — 0 assets.</p>}
    </label>
  )
}

function WorkflowSection({
  value, workflows, onChange,
}: {
  value: WorkflowId | null
  workflows: WorkflowSummary[]
  onChange: (id: WorkflowId | null) => void
}): ReactElement {
  return (
    <section id="filter-workflowIds" tabIndex={-1} className="space-y-1 outline-none">
      <div className="text-xs text-slate-400">Workflow</div>
      <div className="flex flex-wrap gap-2">
        <WorkflowChip label="All" active={value === null} onClick={() => onChange(null)} />
        {workflows.map((w) => {
          const active = value === w.id
          const classes = COLOR_CLASSES[w.colorVariant]
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => onChange(active ? null : w.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active ? classes.badge : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              {w.displayName}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function WorkflowChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-slate-500 bg-slate-700 text-slate-100"
          : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
      }`}
    >{label}</button>
  )
}
