// S#38 PLAN-v3 §5.1 — top app header (replaces TopNav). Three columns:
// brand mark + 2-line title on the left, NavPillBar in the middle,
// version strip + StatusPill + theme toggle on the right.
//
// Props match TopNav's old shape `{ page, onNav }` (Q-38.L) so App.tsx
// can swap the import without touching any callers. Logo + theme
// toggle keep parity with the previous TopNav (data-theme aware
// asset swap, useTheme hook).
//
// Version strip reads:
//   - pkg version: bundled into the client at build time via Vite's
//     existing process.env.npm_package_version flow → here we hardcode
//     the same source as src/server/index.ts (package.json#version) by
//     piggybacking on /api/health's `version` field, exposed via
//     `lastHealth` from StatusPill's onHealth callback.
//   - git short SHA: __GIT_SHA__ build-time define from vite.config.ts.
//   - last gen rel time: derived from `lastHealth.lastGenAt`.

import { useState } from "react"
import type { ReactElement } from "react"
import type { Page } from "@/client/navigator"
import type { HealthData } from "@/client/api/hooks"
import { useTheme } from "@/client/utils/use-theme"
import { NavPillBar } from "./NavPillBar"
import { StatusPill } from "./StatusPill"

export interface AppHeaderProps {
  page: Page
  onNav: (p: Page) => void
}

export function AppHeader({ page, onNav }: AppHeaderProps): ReactElement {
  const { theme, toggle } = useTheme()
  const [health, setHealth] = useState<HealthData | null>(null)
  const isDark = theme === "dark"
  const logoSrc = isDark ? "/logo-dark.png" : "/logo-light.png"

  return (
    <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => onNav("home")}
          aria-label="Creative Studio — Home"
          className="shrink-0 hover:opacity-80 transition-opacity flex items-center gap-3"
        >
          <img
            src={logoSrc}
            alt=""
            width={48}
            height={48}
            className="h-8 w-8 sm:h-12 sm:w-12 block"
          />
          <span className="hidden sm:flex flex-col leading-tight text-left">
            <span className="text-sm font-semibold text-slate-100">Creative Studio</span>
            <span className="text-xs text-slate-400">Ads Images · Google Play ASO</span>
          </span>
        </button>

        <div className="hidden md:block ml-2">
          <NavPillBar page={page} onNav={onNav} />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <VersionStrip health={health} />
          <StatusPill onHealth={setHealth} />
          <button
            type="button"
            onClick={toggle}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
            className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:text-slate-100 hover:border-slate-500 transition-colors"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>

      <div className="md:hidden border-t border-slate-800/60 px-4 py-2">
        <NavPillBar page={page} onNav={onNav} />
      </div>
    </header>
  )
}

function VersionStrip({ health }: { health: HealthData | null }): ReactElement {
  const version = health?.version ?? "…"
  const sha = __GIT_SHA__
  const lastGen = formatLastGen(health?.lastGenAt ?? null)
  return (
    <div
      className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-500"
      data-testid="version-strip"
      title={`version ${version} · sha ${sha} · last gen ${lastGen}`}
    >
      <span>v{version}</span>
      <span className="text-slate-700">·</span>
      <span>#{sha}</span>
      <span className="text-slate-700">·</span>
      <span>last gen {lastGen}</span>
    </div>
  )
}

// Exported so the unit test can lock the formatting independently of
// React render output. "now" anchor is injected so the function stays
// pure + deterministic.
export function formatLastGen(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "—"
  const deltaMs = now.getTime() - then
  if (deltaMs < 0) return "just now"
  const s = Math.floor(deltaMs / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
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
