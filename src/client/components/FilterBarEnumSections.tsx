// Phase 5 Step 3b (Session #29) — enum-style filter sections split out of
// AssetFilterBar to keep the shell under the 250 LOC soft cap:
//   - DateSection: 4-radio preset picker (all/today/7d/30d).
//   - ReplayClassSection: 3-checkbox group with Session #29 Q-29.E "match
//     none" semantics (`[]` distinct from `undefined`).
//   - MultiCheckboxSection: reusable N-checkbox group used for provider +
//     model pickers. Renders an `emptyHint` when `items` is empty instead of
//     an empty list so the Provider-then-Model cascade state is self-evident.
//
// Each section wraps its controls in `id="filter-<schemaKey>"` + `tabIndex={-1}`
// so AssetFilterChips' scroll-to-section handler can focus it.

import type { ChangeEvent, ReactElement } from "react"
import type { DatePreset } from "@/core/schemas/asset-list-filter"
import { DatePresetValues } from "@/core/schemas/asset-list-filter"
import type { ReplayClass } from "@/core/dto/asset-dto"

const REPLAY_CLASSES: ReplayClass[] = ["deterministic", "best_effort", "not_replayable"]
const REPLAY_LABEL: Record<ReplayClass, string> = {
  deterministic: "deterministic",
  best_effort: "best-effort",
  not_replayable: "not replayable",
}
const DATE_PRESET_LABEL: Record<DatePreset, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
}

export function DateSection({
  value, onChange,
}: {
  value: DatePreset | undefined
  onChange: (preset: DatePreset) => void
}): ReactElement {
  const active = value ?? "all"
  return (
    <fieldset id="filter-datePreset" tabIndex={-1} className="space-y-1 outline-none">
      <legend className="text-xs text-slate-400">Date</legend>
      <div className="flex flex-wrap gap-3">
        {DatePresetValues.map((p) => (
          <label key={p} className="flex items-center gap-1 text-xs text-slate-300">
            <input
              type="radio"
              name="datePreset"
              value={p}
              checked={active === p}
              onChange={() => onChange(p)}
            />
            {DATE_PRESET_LABEL[p]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function ReplayClassSection({
  value, onChange,
}: {
  value: ReplayClass[] | undefined
  onChange: (next: ReplayClass[] | undefined) => void
}): ReactElement {
  // undefined = all-3-on (absent). All-3-checked collapses back to undefined
  // so the URL stays clean; `[]` is a distinct "match none" state preserved
  // by the schema (csvArrayPreserveEmpty).
  const selected = new Set<ReplayClass>(value ?? REPLAY_CLASSES)
  const toggle = (rc: ReplayClass, on: boolean): void => {
    const next = new Set(selected)
    if (on) next.add(rc)
    else next.delete(rc)
    const arr = REPLAY_CLASSES.filter((c) => next.has(c))
    if (arr.length === REPLAY_CLASSES.length) onChange(undefined)
    else onChange(arr)
  }
  return (
    <fieldset id="filter-replayClasses" tabIndex={-1} className="space-y-1 outline-none">
      <legend className="text-xs text-slate-400">Replay class</legend>
      <div className="flex flex-wrap gap-3">
        {REPLAY_CLASSES.map((rc) => (
          <label key={rc} className="flex items-center gap-1 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={selected.has(rc)}
              onChange={(e: ChangeEvent<HTMLInputElement>) => toggle(rc, e.target.checked)}
            />
            {REPLAY_LABEL[rc]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export interface MultiCheckboxItem {
  id: string
  label: string
}

export function MultiCheckboxSection({
  id, title, items, value, onChange, emptyHint,
}: {
  id: string
  title: string
  items: MultiCheckboxItem[]
  value: string[]
  onChange: (next: string[]) => void
  emptyHint?: string
}): ReactElement {
  const selected = new Set(value)
  const toggle = (iid: string, on: boolean): void => {
    const next = new Set(selected)
    if (on) next.add(iid)
    else next.delete(iid)
    onChange(items.map((i) => i.id).filter((iid2) => next.has(iid2)))
  }
  return (
    <fieldset id={id} tabIndex={-1} className="space-y-1 outline-none">
      <legend className="text-xs text-slate-400">{title}</legend>
      {items.length === 0 && emptyHint !== undefined ? (
        <p className="text-xs text-slate-500">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-1 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={(e: ChangeEvent<HTMLInputElement>) => toggle(item.id, e.target.checked)}
              />
              {item.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}
