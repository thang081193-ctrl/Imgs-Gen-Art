// Phase D2 (Session #44) — Meta-lane wizard page.
//
// Thin shell that mounts the generic `<PolicyAwareWizard>` chassis
// against the Meta lane config. E (google-ads) and F2 (play-aso) get
// matching pages with their own configs.

import type { ReactElement } from "react"

import { PolicyAwareWizard } from "@/client/components/PolicyAwareWizard"
import type { ShowToast } from "@/client/components/ToastHost"
import {
  metaConfig,
  type MetaWizardForm,
} from "@/client/lane-wizards/meta-config"
import type { Navigator } from "@/client/navigator"

export interface MetaWizardProps {
  navigator: Navigator
  showToast: ShowToast
}

export function MetaWizard({
  navigator,
  showToast,
}: MetaWizardProps): ReactElement {
  return (
    <PolicyAwareWizard<MetaWizardForm>
      config={metaConfig}
      showToast={showToast}
      onNav={navigator.go}
    />
  )
}
