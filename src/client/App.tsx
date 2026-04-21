// Minimal useState-based page switcher. Phase 1 has only Home; Phase 5 CMS
// will extend the Page union (profiles, gallery, keys, templates, etc.)
// and introduce nav chrome. No react-router-dom until we actually need it.

import { useState } from "react"
import type { ReactElement } from "react"
import { Home } from "@/client/pages/Home"

type Page = "home"

export function App(): ReactElement {
  const [page] = useState<Page>("home")
  switch (page) {
    case "home":
      return <Home />
  }
}
