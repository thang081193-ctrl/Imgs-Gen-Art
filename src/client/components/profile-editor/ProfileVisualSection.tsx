// Session #30 Step 4 — Visual section (3 colors + tone + do/don't lists).
// Color inputs use native <input type="color"> plus a hex text field so
// users can paste brand hex values directly. Hex is validated loosely here;
// the server's Zod regex is the source of truth.

import type { ChangeEvent, ReactElement } from "react"
import type { ProfileTone, ProfileVisualDto } from "@/core/dto/profile-dto"
import { StringListEditor } from "./StringListEditor"

const TONES: { id: ProfileTone; label: string }[] = [
  { id: "minimal", label: "Minimal" },
  { id: "bold", label: "Bold" },
  { id: "playful", label: "Playful" },
  { id: "elegant", label: "Elegant" },
  { id: "technical", label: "Technical" },
  { id: "warm", label: "Warm" },
]

const HEX6 = /^#[0-9a-fA-F]{6}$/

export interface ProfileVisualSectionProps {
  value: ProfileVisualDto
  onChange: (patch: Partial<ProfileVisualDto>) => void
}

export function ProfileVisualSection({
  value,
  onChange,
}: ProfileVisualSectionProps): ReactElement {
  return (
    <section className="space-y-4 rounded-md border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="text-sm font-semibold text-slate-100">Visual</h2>

      <div className="grid grid-cols-3 gap-3">
        <ColorField
          label="Primary"
          value={value.primaryColor}
          onChange={(next) => onChange({ primaryColor: next })}
        />
        <ColorField
          label="Secondary"
          value={value.secondaryColor}
          onChange={(next) => onChange({ secondaryColor: next })}
        />
        <ColorField
          label="Accent"
          value={value.accentColor}
          onChange={(next) => onChange({ accentColor: next })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-400" htmlFor="profile-tone">Tone</label>
        <select
          id="profile-tone"
          value={value.tone}
          onChange={(e) => onChange({ tone: e.target.value as ProfileTone })}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
        >
          {TONES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <StringListEditor
        label="Do"
        value={value.doList}
        onChange={(next) => onChange({ doList: next })}
        maxItemLength={120}
        helpText="Positive directives (e.g. 'use clean geometric type')."
      />

      <StringListEditor
        label="Don't"
        value={value.dontList}
        onChange={(next) => onChange({ dontList: next })}
        maxItemLength={120}
        helpText="Hard anti-patterns (e.g. 'no clip-art icons')."
      />
    </section>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}): ReactElement {
  const handlePicker = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange(e.target.value)
  }
  const handleHex = (e: ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value.trim()
    // Accept partial typing; commit only when 6-hex shape matches.
    if (HEX6.test(raw)) onChange(raw.toLowerCase())
  }
  const safe = HEX6.test(value) ? value : "#000000"
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={handlePicker}
          className="h-9 w-12 shrink-0 cursor-pointer rounded border border-slate-700 bg-slate-900"
          aria-label={`${label} color picker`}
        />
        <input
          type="text"
          defaultValue={value}
          onBlur={handleHex}
          placeholder="#rrggbb"
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  )
}
