// S#38 PLAN-v3 §1 — giant lane entry-point card on the Home page.
// S#44 D2 — split the legacy "ads"/"aso" pair into the per-platform
// triple (X-1 LOCKED): Meta + Google + Play each own a card. Meta
// nav-targets `/wizard/meta-ads` from D2; Google/Play stay on toast
// until E and F2 ship their wizards.
//
// Visual: a flat-tinted card with lane icon top-left, title + subtitle
// stacked, and a chevron-right hint bottom-right that animates on hover.

import type { ReactElement } from "react"
import type { ColorVariant } from "@/core/design/types"
import { COLOR_CLASSES } from "@/core/design"

export type LaneId = "meta-ads" | "google-ads" | "play-aso"

export interface LaneCtaCardProps {
  laneId: LaneId
  title: string
  subtitle: string
  colorVariant: ColorVariant
  Icon: () => ReactElement
  onClick: () => void
}

export function LaneCtaCard({
  laneId,
  title,
  subtitle,
  colorVariant,
  Icon,
  onClick,
}: LaneCtaCardProps): ReactElement {
  const classes = COLOR_CLASSES[colorVariant]
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`lane-cta-${laneId}`}
      data-lane={laneId}
      className={`group relative overflow-hidden rounded-2xl border p-6 text-left transition-all hover:scale-[1.01] active:scale-[0.99] ${classes.inactive}`}
    >
      <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${classes.badge}`}>
        <Icon />
      </div>
      <div className="mt-4 space-y-1">
        <div className="text-xl font-semibold text-slate-100">{title}</div>
        <div className="text-sm text-slate-400 max-w-md">{subtitle}</div>
      </div>
      <div className={`absolute bottom-5 right-5 text-xs font-medium ${classes.text} opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all`}>
        Bắt đầu →
      </div>
    </button>
  )
}

export function AdsLaneIcon(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l18-5v12L3 13z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  )
}

export function GoogleAdsLaneIcon(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21l7-14 7 14H5z" />
      <path d="M9.5 17.5l5-10" />
    </svg>
  )
}

export function AsoLaneIcon(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  )
}
