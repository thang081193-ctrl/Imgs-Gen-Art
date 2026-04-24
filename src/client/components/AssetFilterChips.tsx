// Phase 5 Step 3b (Session #29) — active-filter-only summary chips. Each chip
// body scroll-focuses the matching AssetFilterBar section; its × clears that
// dimension. "Clear all" shows when ≥ 2 dimensions are active.
//
// CHIP_ORDER is specificity-first (Q-29.A pushback): batch → profile → workflow
// → tags → replay → provider → model → date. Anchors on the bar side use
// `id="filter-<schemaKey>"` + the `.flash-highlight` keyframe in index.css.

import type { MouseEvent, ReactElement } from "react"
import type { AssetListFilter, TagMatchMode } from "@/core/schemas/asset-list-filter"
import type { ReplayClass } from "@/core/dto/asset-dto"
import type { ProfileSummaryDto } from "@/core/dto/profile-dto"
import type { ModelInfo, ProviderInfo } from "@/core/model-registry/types"
import type { WorkflowSummary } from "@/client/api/hooks"

export type AssetFilterDimension =
  | "batchId"
  | "profileIds"
  | "workflowIds"
  | "tags"
  | "replayClasses"
  | "providerIds"
  | "modelIds"
  | "datePreset"

const CHIP_ORDER: AssetFilterDimension[] = [
  "batchId",
  "profileIds",
  "workflowIds",
  "tags",
  "replayClasses",
  "providerIds",
  "modelIds",
  "datePreset",
]

const DIMENSION_LABEL: Record<AssetFilterDimension, string> = {
  batchId: "Batch",
  profileIds: "Profile",
  workflowIds: "Workflow",
  tags: "Tags",
  replayClasses: "Replay",
  providerIds: "Provider",
  modelIds: "Model",
  datePreset: "Date",
}

export const REPLAY_CLASS_DISPLAY: Record<ReplayClass, string> = {
  deterministic: "deterministic",
  best_effort: "best-effort",
  not_replayable: "not replayable",
}

const DATE_PRESET_DISPLAY: Record<"today" | "7d" | "30d", string> = {
  today: "today",
  "7d": "last 7 days",
  "30d": "last 30 days",
}

const TAG_MATCH_MODE_DISPLAY: Record<TagMatchMode, string> = {
  any: "any",
  all: "all",
}

const MAX_CHIP_VALUES = 3

export interface AssetFilterChipsProps {
  filter: AssetListFilter
  profiles: ProfileSummaryDto[]
  workflows: WorkflowSummary[]
  providers: ProviderInfo[]
  models: ModelInfo[]
  onClearDimension: (dimension: AssetFilterDimension) => void
  onClearAll: () => void
}

export function AssetFilterChips({
  filter,
  profiles,
  workflows,
  providers,
  models,
  onClearDimension,
  onClearAll,
}: AssetFilterChipsProps): ReactElement | null {
  const lookups = { profiles, workflows, providers, models }
  const chips = CHIP_ORDER
    .map((d) => ({ dimension: d, content: resolveChipContent(d, filter, lookups) }))
    .filter((x): x is { dimension: AssetFilterDimension; content: ChipContent } =>
      x.content !== null,
    )

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map(({ dimension, content }) => (
        <Chip
          key={dimension}
          dimension={dimension}
          content={content}
          onClearDimension={onClearDimension}
        />
      ))}
      {chips.length >= 2 && (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-auto rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

interface ChipContent {
  label: string
  body: string
  overflow: number
}

interface Lookups {
  profiles: ProfileSummaryDto[]
  workflows: WorkflowSummary[]
  providers: ProviderInfo[]
  models: ModelInfo[]
}

function resolveChipContent(
  dimension: AssetFilterDimension,
  filter: AssetListFilter,
  lookups: Lookups,
): ChipContent | null {
  const label = DIMENSION_LABEL[dimension]
  switch (dimension) {
    case "batchId":
      return filter.batchId ? { label, body: filter.batchId, overflow: 0 } : null
    case "profileIds":
      return multiChip(label, filter.profileIds, (id) =>
        lookups.profiles.find((p) => p.id === id)?.name ?? id,
      )
    case "workflowIds":
      return multiChip(label, filter.workflowIds, (id) =>
        lookups.workflows.find((w) => w.id === id)?.displayName ?? id,
      )
    case "providerIds":
      return multiChip(label, filter.providerIds, (id) =>
        lookups.providers.find((p) => p.id === id)?.displayName ?? id,
      )
    case "modelIds":
      return multiChip(label, filter.modelIds, (id) =>
        lookups.models.find((m) => m.id === id)?.displayName ?? id,
      )
    case "tags": {
      const base = multiChip(label, filter.tags, (t) => `#${t}`)
      if (!base) return null
      const mode = filter.tagMatchMode ?? "any"
      return { ...base, body: `${base.body} (${TAG_MATCH_MODE_DISPLAY[mode]})` }
    }
    case "replayClasses": {
      const rc = filter.replayClasses
      if (rc === undefined || rc.length === 3) return null  // "all 3" = no chip
      if (rc.length === 0) return { label, body: "none", overflow: 0 }
      const names = rc.map((c) => REPLAY_CLASS_DISPLAY[c])
      return { label, body: names.join(", "), overflow: 0 }
    }
    case "datePreset": {
      // Session #32 F3 — custom range takes precedence over preset.
      if (filter.dateFrom !== undefined || filter.dateTo !== undefined) {
        const from = filter.dateFrom ?? "…"
        const to = filter.dateTo ?? "…"
        return { label, body: `${from} → ${to}`, overflow: 0 }
      }
      const preset = filter.datePreset
      if (preset === undefined || preset === "all") return null
      return { label, body: DATE_PRESET_DISPLAY[preset], overflow: 0 }
    }
  }
}

function multiChip(
  label: string,
  values: string[] | undefined,
  resolve: (id: string) => string,
): ChipContent | null {
  if (!values || values.length === 0) return null
  const shown = values.slice(0, MAX_CHIP_VALUES).map(resolve)
  const overflow = Math.max(0, values.length - MAX_CHIP_VALUES)
  return { label, body: shown.join(", "), overflow }
}

function Chip({
  dimension,
  content,
  onClearDimension,
}: {
  dimension: AssetFilterDimension
  content: ChipContent
  onClearDimension: (dimension: AssetFilterDimension) => void
}): ReactElement {
  const handleBodyClick = (): void => { scrollAndFocusSection(dimension) }
  const handleClearClick = (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
    onClearDimension(dimension)
  }
  const suffix = content.overflow > 0 ? ` +${content.overflow} more` : ""

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 pl-3 text-xs text-slate-200">
      <button
        type="button"
        onClick={handleBodyClick}
        className="py-1 text-left hover:text-slate-100"
        aria-label={`Edit ${content.label} filter`}
      >
        <span className="text-slate-400">{content.label}:</span>{" "}
        <span>{content.body}</span>
        {suffix && <span className="text-slate-500">{suffix}</span>}
      </button>
      <button
        type="button"
        onClick={handleClearClick}
        className="px-2 py-1 text-slate-500 hover:text-slate-100"
        aria-label={`Clear ${content.label} filter`}
      >
        ×
      </button>
    </span>
  )
}

// Anchor convention: AssetFilterBar sets `id="filter-<dimension>"` +
// `tabIndex={-1}` on each section wrapper. The flash-highlight class is a
// 1.2s keyframe animation defined in src/client/styles/index.css.
function scrollAndFocusSection(dimension: AssetFilterDimension): void {
  if (typeof document === "undefined") return
  const el = document.getElementById(`filter-${dimension}`)
  if (!el) return
  el.scrollIntoView({ block: "nearest", behavior: "smooth" })
  // Remove-then-add + forced reflow retriggers the keyframe on rapid re-clicks.
  el.classList.remove("flash-highlight")
  void el.getBoundingClientRect()
  el.classList.add("flash-highlight")
  const focusable = el.querySelector<HTMLElement>(
    "input, select, textarea, button, [tabindex]:not([tabindex='-1'])",
  )
  focusable?.focus()
}
