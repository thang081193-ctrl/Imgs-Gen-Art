// Session #30 Step 4 — Context section (features + keyScenarios +
// forbiddenContent). Three StringListEditor instances in a vertical stack.

import type { ReactElement } from "react"
import type { ProfileContextDto } from "@/core/dto/profile-dto"
import { StringListEditor } from "./StringListEditor"

export interface ProfileContextSectionProps {
  value: ProfileContextDto
  onChange: (patch: Partial<ProfileContextDto>) => void
}

export function ProfileContextSection({
  value,
  onChange,
}: ProfileContextSectionProps): ReactElement {
  return (
    <section className="space-y-3 rounded-md border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="text-sm font-semibold text-slate-100">Context</h2>

      <StringListEditor
        label="Features"
        value={value.features}
        onChange={(next) => onChange({ features: next })}
        maxItemLength={120}
        helpText="Concrete user-facing capabilities."
      />

      <StringListEditor
        label="Key scenarios"
        value={value.keyScenarios}
        onChange={(next) => onChange({ keyScenarios: next })}
        maxItemLength={160}
        helpText="Moments when users reach for this app."
      />

      <StringListEditor
        label="Forbidden content"
        value={value.forbiddenContent}
        onChange={(next) => onChange({ forbiddenContent: next })}
        maxItemLength={160}
        helpText="Subjects generations must avoid."
      />
    </section>
  )
}
