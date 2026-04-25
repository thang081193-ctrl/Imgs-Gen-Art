// S#38 PLAN-v3 §5.1 — pill-style top nav. `[Profiles] [Specs] [Gallery]
// [Settings]` with inline-SVG leading icons. The Specs slot is a stable
// alias for "PromptLab" (renamed in PLAN-v3 §1 vocabulary) — it still
// navigates to the existing `prompt-lab` page until B1 ships the lab
// rewrite. Reserved Video slot rendered behind VIDEO_LANE_ENABLED
// (locked false in v2 per Q-38.F) so the layout is forward-compatible
// with v3+ without touching this file.
//
// Active state derives from the page prop — `home` shows no pill as
// active because the brand mark already covers the home affordance.

import type { ReactElement } from "react"
import type { Page } from "@/client/navigator"

export const VIDEO_LANE_ENABLED = false

interface PillSpec {
  label: string
  target: Page
  Icon: () => ReactElement
}

const PILLS: PillSpec[] = [
  { label: "Profiles", target: "profiles",   Icon: ProfilesIcon },
  { label: "Specs",    target: "prompt-lab", Icon: SpecsIcon },
  { label: "Gallery",  target: "gallery",    Icon: GalleryIcon },
  { label: "Settings", target: "settings",   Icon: SettingsIcon },
]

export interface NavPillBarProps {
  page: Page
  onNav: (p: Page) => void
}

export function NavPillBar({ page, onNav }: NavPillBarProps): ReactElement {
  return (
    <div className="flex items-center gap-1" role="navigation" aria-label="Primary">
      {PILLS.map(({ label, target, Icon }) => {
        const active = page === target
        return (
          <button
            key={target}
            type="button"
            onClick={() => onNav(target)}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-slate-800 text-slate-100 ring-1 ring-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Icon />
            <span>{label}</span>
          </button>
        )
      })}
      {VIDEO_LANE_ENABLED ? (
        <button
          type="button"
          onClick={() => onNav("home")}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-violet-400 hover:bg-violet-950/40"
        >
          <VideoIcon />
          <span>Video</span>
        </button>
      ) : null}
    </div>
  )
}

function ProfilesIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function SpecsIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  )
}

function GalleryIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

function SettingsIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function VideoIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  )
}
