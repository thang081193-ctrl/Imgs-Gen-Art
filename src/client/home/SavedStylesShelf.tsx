// S#38 PLAN-v3 §1 — Home page Saved Styles shelf. Fetches GET
// /api/saved-styles, renders a horizontal-scrolling row of cards. Each
// card carries a kind badge so user-saved rows are visually
// distinguishable from the 3 boot-seeded `preset-legacy` rows. Click
// navigates to the saved-style-detail page (Q-38.E read-only stub).
//
// Empty state (Q-38.D): when only presets exist (typical state on
// fresh install), the shelf renders the 3 presets followed by an
// inline "No personal styles yet — sign up by ⭐ on a generated
// asset" prompt. The ⭐ flow itself ships in D1+; we copy the
// placeholder text now so the UI tells the right story.

import type { ReactElement, ReactNode } from "react"
import { useSavedStyles } from "@/client/api/hooks"
import type { SavedStyleDto, SavedStyleKind } from "@/core/dto/saved-style-dto"
import type { NavParams, Page } from "@/client/navigator"

export interface SavedStylesShelfProps {
  onNav: (page: Page, params?: NavParams) => void
}

const KIND_LABEL: Record<SavedStyleKind, string> = {
  "preset-legacy": "Preset",
  user: "Của bạn",
}

const KIND_BADGE_CLASS: Record<SavedStyleKind, string> = {
  "preset-legacy": "bg-slate-800 text-slate-300 border-slate-700",
  user: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60",
}

export function SavedStylesShelf({ onNav }: SavedStylesShelfProps): ReactElement {
  const q = useSavedStyles()

  if (q.loading) {
    return <ShelfFrame><div className="text-sm text-slate-500">Đang tải saved styles…</div></ShelfFrame>
  }

  if (q.error !== null) {
    return (
      <ShelfFrame>
        <div className="text-sm text-red-400">Không tải được saved styles — {q.error.message}</div>
      </ShelfFrame>
    )
  }

  const styles = q.data?.styles ?? []
  const hasUserStyle = styles.some((s) => s.kind === "user")

  return (
    <ShelfFrame>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {styles.map((style) => (
          <SavedStyleCard
            key={style.id}
            style={style}
            onClick={() => onNav("saved-style-detail", { savedStyleId: style.id })}
          />
        ))}
      </div>
      {!hasUserStyle ? (
        <p className="text-xs text-slate-500 mt-3">
          Chưa có style cá nhân — bấm ⭐ trên một asset đã generate để lưu lại.
          <span className="text-slate-600"> (sắp ra mắt)</span>
        </p>
      ) : null}
    </ShelfFrame>
  )
}

function ShelfFrame({ children }: { children: ReactNode }): ReactElement {
  return (
    <section aria-label="Saved styles" data-testid="saved-styles-shelf" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Saved Styles
        </h2>
      </div>
      {children}
    </section>
  )
}

function SavedStyleCard({
  style,
  onClick,
}: {
  style: SavedStyleDto
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`saved-style-card-${style.id}`}
      data-kind={style.kind}
      className="shrink-0 w-56 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-left hover:border-slate-700 hover:bg-slate-900 transition-colors"
    >
      <div className="aspect-video w-full rounded-md bg-slate-950 border border-slate-800 mb-2 overflow-hidden">
        {style.previewAssetUrl ? (
          <img
            src={style.previewAssetUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-slate-700 text-xs">
            no preview
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${KIND_BADGE_CLASS[style.kind]}`}
        >
          {KIND_LABEL[style.kind]}
        </span>
        {style.usageCount > 0 ? (
          <span className="text-[10px] text-slate-500">used {style.usageCount}×</span>
        ) : null}
      </div>
      <div className="text-sm font-medium text-slate-200 line-clamp-1">{style.name}</div>
      {style.description ? (
        <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{style.description}</div>
      ) : null}
    </button>
  )
}
