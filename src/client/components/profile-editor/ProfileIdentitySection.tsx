// Session #30 Step 4 — Identity section (name + tagline + category).
// Form slice: { name, tagline, category }. Controlled inputs drive onChange
// at the field level so dirty state in ProfileEdit compares slices cheaply.

import type { ChangeEvent, ReactElement } from "react"
import type { ProfileCategory } from "@/core/dto/profile-dto"

const CATEGORIES: { id: ProfileCategory; label: string }[] = [
  { id: "utility", label: "Utility" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "productivity", label: "Productivity" },
  { id: "entertainment", label: "Entertainment" },
  { id: "education", label: "Education" },
]

export interface IdentityValue {
  name: string
  tagline: string
  category: ProfileCategory
}

export interface ProfileIdentitySectionProps {
  value: IdentityValue
  onChange: (patch: Partial<IdentityValue>) => void
  nameError?: string | null
}

export function ProfileIdentitySection({
  value,
  onChange,
  nameError,
}: ProfileIdentitySectionProps): ReactElement {
  const handleName = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange({ name: e.target.value })
  }
  const handleTagline = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange({ tagline: e.target.value })
  }
  const handleCategory = (e: ChangeEvent<HTMLSelectElement>): void => {
    onChange({ category: e.target.value as ProfileCategory })
  }

  return (
    <section className="space-y-3 rounded-md border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="text-sm font-semibold text-slate-100">Identity</h2>
      <div className="space-y-1">
        <label className="text-xs text-slate-400" htmlFor="profile-name">
          Name <span className="text-red-400">*</span>
        </label>
        <input
          id="profile-name"
          type="text"
          value={value.name}
          onChange={handleName}
          placeholder="e.g. ChartLens"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
        />
        {nameError !== null && nameError !== undefined && (
          <p className="text-xs text-red-400">{nameError}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-400" htmlFor="profile-tagline">
          Tagline
        </label>
        <input
          id="profile-tagline"
          type="text"
          value={value.tagline}
          onChange={handleTagline}
          placeholder="One-line pitch"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-400" htmlFor="profile-category">
          Category
        </label>
        <select
          id="profile-category"
          value={value.category}
          onChange={handleCategory}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
