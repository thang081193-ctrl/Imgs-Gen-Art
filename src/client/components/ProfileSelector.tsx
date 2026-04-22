// Profile dropdown. Fetches /api/profiles via useProfiles hook (owned by
// parent), renders as a `<select>` with id + name label. Empty state
// instructs seed-profile bootstrap.

import type { ReactElement } from "react"
import type { ProfileSummaryDto } from "@/core/dto/profile-dto"

export interface ProfileSelectorProps {
  profiles: ProfileSummaryDto[]
  value: string | null
  onChange: (id: string) => void
  loading?: boolean
  error?: Error | null
}

export function ProfileSelector({
  profiles,
  value,
  onChange,
  loading,
  error,
}: ProfileSelectorProps): ReactElement {
  if (loading) {
    return <p className="text-xs text-slate-500">Loading profiles…</p>
  }
  if (error) {
    return <p className="text-xs text-red-400">Failed to load profiles: {error.message}</p>
  }
  if (profiles.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No profiles. Run <code className="text-slate-300">npm run seed:profiles</code> on the server.
      </p>
    )
  }
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
    >
      <option value="" disabled>Select a profile…</option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} — {p.category}
        </option>
      ))}
    </select>
  )
}
