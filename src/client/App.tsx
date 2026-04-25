// App shell. Owns router state (page + params) and toast stack. Children
// receive `navigator` + `showToast` props; no context, no react-router —
// the small page count makes prop-drilling cheaper than infra.
//
// Session #30 Step 4: adds `profiles` list + `profile-edit` editor pages
// plus a navigation guard so the editor can block in-app navigation while
// dirty (beforeunload for tab close lives inside ProfileEdit itself).
//
// Session #38: AppHeader replaces TopNav (lane-first IA per PLAN-v3 §5)
// + saved-style-detail page mounted (Home shelf click target).

import { useRef, useState } from "react"
import type { ReactElement } from "react"
import { Home } from "@/client/pages/Home"
import { Workflow } from "@/client/pages/Workflow"
import { Gallery } from "@/client/pages/Gallery"
import { PromptLab } from "@/client/pages/PromptLab"
import { Settings } from "@/client/pages/Settings"
import { Profiles } from "@/client/pages/Profiles"
import { ProfileEdit } from "@/client/pages/ProfileEdit"
import { SavedStyleDetail } from "@/client/pages/SavedStyleDetail"
import { MetaWizard } from "@/client/pages/MetaWizard"
import { GoogleWizard } from "@/client/pages/GoogleWizard"
import { AppHeader } from "@/client/components/AppHeader"
import { ToastHost, useToastStack } from "@/client/components/ToastHost"
import type { NavGuard, NavParams, Navigator, Page } from "@/client/navigator"

export function App(): ReactElement {
  const [page, setPage] = useState<Page>("home")
  const [params, setParams] = useState<NavParams>({})
  // Ref — guard reads must be synchronous during `go()`, and the guard
  // owner (ProfileEdit) swaps implementations as dirty state changes.
  const guardRef = useRef<NavGuard | null>(null)

  const navigator: Navigator = {
    page,
    params,
    go: (next, nextParams = {}) => {
      const guard = guardRef.current
      if (guard !== null && !guard()) return
      setPage(next)
      setParams(nextParams)
    },
    registerGuard: (guard) => {
      guardRef.current = guard
    },
    unregisterGuard: () => {
      guardRef.current = null
    },
  }

  const { toasts, show, dismiss } = useToastStack()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader page={page} onNav={(p) => navigator.go(p)} />
      {page === "home"               && <Home onNav={navigator.go} showToast={show} />}
      {page === "workflow"           && <Workflow navigator={navigator} showToast={show} />}
      {page === "gallery"            && <Gallery  navigator={navigator} showToast={show} />}
      {page === "prompt-lab"         && <PromptLab navigator={navigator} showToast={show} />}
      {page === "settings"           && <Settings showToast={show} />}
      {page === "profiles"           && <Profiles navigator={navigator} showToast={show} />}
      {page === "profile-edit"       && <ProfileEdit navigator={navigator} showToast={show} />}
      {page === "saved-style-detail" && <SavedStyleDetail navigator={navigator} showToast={show} />}
      {page === "wizard-meta-ads"    && <MetaWizard navigator={navigator} showToast={show} />}
      {page === "wizard-google-ads"  && <GoogleWizard navigator={navigator} showToast={show} />}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
