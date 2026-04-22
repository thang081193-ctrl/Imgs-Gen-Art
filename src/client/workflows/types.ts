// Sidecar workflow-form contract. Each of the 4 workflows ships a
// component file that owns its local form state and reports a validated
// `input` payload (or `null` if invalid) up to the Workflow page.
//
// Why sidecar over generic form-builder (Q1(a)): each workflow has
// distinct UX needs — ad-production's featureFocus enum dropdown,
// style-transform's screenshot picker + empty-state CTA, aso-screenshots'
// chip-picker with grey-out for provider-unsupported langs — which a
// generic JSON-schema renderer would either ignore or need per-field
// overrides for anyway.

import type { FC } from "react"
import type { ProfileDto } from "@/core/dto/profile-dto"
import type { ModelInfo } from "@/core/model-registry/types"
import type { WorkflowId } from "@/core/design/types"
import type { NavParams, Page } from "@/client/navigator"
import type { ShowToast } from "@/client/components/ToastHost"

export interface WorkflowFormProps {
  model: ModelInfo
  profile: ProfileDto | null  // full load; null if still fetching
  onInputChange: (input: unknown | null, error?: string) => void
  onNav: (p: Page, params?: NavParams) => void
  showToast: ShowToast
}

export interface WorkflowFormDescriptor {
  id: WorkflowId
  Component: FC<WorkflowFormProps>
}
