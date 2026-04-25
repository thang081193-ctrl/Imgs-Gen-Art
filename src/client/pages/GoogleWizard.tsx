// Phase E (Session #44) — Google Ads lane wizard page.

import type { ReactElement } from "react"

import { PolicyAwareWizard } from "@/client/components/PolicyAwareWizard"
import type { ShowToast } from "@/client/components/ToastHost"
import {
  googleConfig,
  type GoogleAdsWizardForm,
} from "@/client/lane-wizards/google-config"
import type { Navigator } from "@/client/navigator"

export interface GoogleWizardProps {
  navigator: Navigator
  showToast: ShowToast
}

export function GoogleWizard({
  navigator,
  showToast,
}: GoogleWizardProps): ReactElement {
  return (
    <PolicyAwareWizard<GoogleAdsWizardForm>
      config={googleConfig}
      showToast={showToast}
      onNav={navigator.go}
    />
  )
}
