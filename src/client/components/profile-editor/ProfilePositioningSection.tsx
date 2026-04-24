// Session #30 Step 4 — Positioning section (usp + persona + marketTier
// + competitors). usp + persona are textareas (prose inputs); marketTier
// is an enum select; competitors uses the shared StringListEditor.

import type { ChangeEvent, ReactElement } from "react"
import type {
  ProfileMarketTier,
  ProfilePositioningDto,
} from "@/core/dto/profile-dto"
import { StringListEditor } from "./StringListEditor"

const TIERS: { id: ProfileMarketTier; label: string }[] = [
  { id: "tier1", label: "Tier 1 — mature Western markets" },
  { id: "tier2", label: "Tier 2 — mid-income emerging" },
  { id: "tier3", label: "Tier 3 — price-sensitive / frontier" },
  { id: "global", label: "Global — tier-agnostic" },
]

export interface ProfilePositioningSectionProps {
  value: ProfilePositioningDto
  onChange: (patch: Partial<ProfilePositioningDto>) => void
}

export function ProfilePositioningSection({
  value,
  onChange,
}: ProfilePositioningSectionProps): ReactElement {
  const handleUsp = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    onChange({ usp: e.target.value })
  }
  const handlePersona = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    onChange({ targetPersona: e.target.value })
  }
  const handleTier = (e: ChangeEvent<HTMLSelectElement>): void => {
    onChange({ marketTier: e.target.value as ProfileMarketTier })
  }
  const competitors = value.competitors ?? []

  return (
    <section className="space-y-3 rounded-md border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="text-sm font-semibold text-slate-100">Positioning</h2>

      <div className="space-y-1">
        <label className="text-xs text-slate-400" htmlFor="profile-usp">USP</label>
        <textarea
          id="profile-usp"
          value={value.usp}
          onChange={handleUsp}
          rows={2}
          placeholder="What only this app does"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-400" htmlFor="profile-persona">
          Target persona
        </label>
        <textarea
          id="profile-persona"
          value={value.targetPersona}
          onChange={handlePersona}
          rows={2}
          placeholder="Who this is for"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-400" htmlFor="profile-tier">
          Market tier
        </label>
        <select
          id="profile-tier"
          value={value.marketTier}
          onChange={handleTier}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
        >
          {TIERS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <StringListEditor
        label="Competitors"
        value={competitors}
        onChange={(next) =>
          onChange(next.length > 0 ? { competitors: next } : { competitors: undefined })
        }
        maxItemLength={80}
        helpText="Apps we're measured against."
      />
    </section>
  )
}
