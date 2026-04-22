// App shell. Owns router state (page + params) and toast stack. Children
// receive `navigator` + `showToast` props; no context, no react-router —
// 3 pages make prop-drilling cheaper than infra.

import { useState } from "react"
import type { ReactElement } from "react"
import { Home } from "@/client/pages/Home"
import { Workflow } from "@/client/pages/Workflow"
import { Gallery } from "@/client/pages/Gallery"
import { TopNav } from "@/client/components/TopNav"
import { ToastHost, useToastStack } from "@/client/components/ToastHost"
import type { NavParams, Navigator, Page } from "@/client/navigator"

export function App(): ReactElement {
  const [page, setPage] = useState<Page>("home")
  const [params, setParams] = useState<NavParams>({})
  const navigator: Navigator = {
    page,
    params,
    go: (next, nextParams = {}) => {
      setPage(next)
      setParams(nextParams)
    },
  }
  const { toasts, show, dismiss } = useToastStack()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopNav page={page} onNav={(p) => navigator.go(p)} />
      {page === "home"     && <Home onNav={navigator.go} />}
      {page === "workflow" && <Workflow navigator={navigator} showToast={show} />}
      {page === "gallery"  && <Gallery  navigator={navigator} showToast={show} />}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
