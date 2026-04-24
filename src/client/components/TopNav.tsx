// Sticky top nav. 3 page links + app title. No react-router — click handler
// drives the App's `go` navigator. Active page gets a highlighted pill.

import type { ReactElement } from "react"
import type { Page } from "@/client/navigator"

export interface TopNavProps {
  page: Page
  onNav: (p: Page) => void
}

export function TopNav({ page, onNav }: TopNavProps): ReactElement {
  return (
    <nav className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
        <button
          type="button"
          onClick={() => onNav("home")}
          className="font-bold text-slate-100 tracking-tight hover:text-white"
        >
          Images Gen Art
        </button>
        <div className="flex gap-1">
          <NavLink label="Home"     target="home"     current={page} onNav={onNav} />
          <NavLink label="Workflow" target="workflow" current={page} onNav={onNav} />
          <NavLink label="Gallery"  target="gallery"  current={page} onNav={onNav} />
          <NavLink label="Profiles" target="profiles" current={page} onNav={onNav} />
          <NavLink label="Settings" target="settings" current={page} onNav={onNav} />
        </div>
      </div>
    </nav>
  )
}

function NavLink({
  label,
  target,
  current,
  onNav,
}: {
  label: string
  target: Page
  current: Page
  onNav: (p: Page) => void
}): ReactElement {
  const active = current === target
  return (
    <button
      type="button"
      onClick={() => onNav(target)}
      className={`px-3 py-1.5 rounded text-sm transition-colors ${
        active
          ? "bg-slate-800 text-slate-100"
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
      }`}
    >
      {label}
    </button>
  )
}
