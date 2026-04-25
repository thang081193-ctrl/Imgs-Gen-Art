// Phase F2 (Session #44) — Play ASO lane wizard page (Q-48.A LOCKED).

import type { ReactElement } from "react"

import { PolicyAwareWizard } from "@/client/components/PolicyAwareWizard"
import type { ShowToast } from "@/client/components/ToastHost"
import {
  playConfig,
  type PlayWizardForm,
} from "@/client/lane-wizards/play-config"
import type { Navigator } from "@/client/navigator"

export interface PlayWizardProps {
  navigator: Navigator
  showToast: ShowToast
}

export function PlayWizard({
  navigator,
  showToast,
}: PlayWizardProps): ReactElement {
  return (
    <PolicyAwareWizard<PlayWizardForm>
      config={playConfig}
      showToast={showToast}
      onNav={navigator.go}
    />
  )
}
