// Sticky top nav. Page links + JM Studio brand mark + dark/light theme
// toggle. Click handler drives the App's `go` navigator. Active page gets
// a highlighted pill; the brand mark + the toggle both swap based on the
// `useTheme` state (Session #33 theme overlay).

import type { ReactElement } from "react"
import type { Page } from "@/client/navigator"
import { useTheme } from "@/client/utils/use-theme"

export interface TopNavProps {
  page: Page
  onNav: (p: Page) => void
}

export function TopNav({ page, onNav }: TopNavProps): ReactElement {
  const { theme, toggle } = useTheme()
  const logoSrc = theme === "dark" ? "/logo-dark.png" : "/logo-light.png"
  const isDark = theme === "dark"

  return (
    <nav className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
        <button
          type="button"
          onClick={() => onNav("home")}
          aria-label="JM Studio — Home"
          className="shrink-0 hover:opacity-80 transition-opacity"
        >
          <img
            src={logoSrc}
            alt="JM Studio"
            width={36}
            height={36}
            className="h-9 w-9 block"
          />
        </button>
        <div className="flex gap-1">
          <NavLink label="Home"      target="home"       current={page} onNav={onNav} />
          <NavLink label="Workflow"  target="workflow"   current={page} onNav={onNav} />
          <NavLink label="Gallery"   target="gallery"    current={page} onNav={onNav} />
          <NavLink label="PromptLab" target="prompt-lab" current={page} onNav={onNav} />
          <NavLink label="Profiles"  target="profiles"   current={page} onNav={onNav} />
          <NavLink label="Settings"  target="settings"   current={page} onNav={onNav} />
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          className="ml-auto rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:text-slate-100 hover:border-slate-500 transition-colors"
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
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

function SunIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
