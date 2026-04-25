// S#38 PLAN-v3 §1 — Home rewrite. The old single "Run a workflow" CTA is
// replaced by two giant LaneCtaCards (Ads Images + Google Play ASO) plus
// a Saved Styles shelf. The status pill + version strip live in the
// AppHeader now, so this page focuses purely on lane-first navigation.
//
// Lane-card click currently fires a toast (Q-38.I = b) — the wizard
// route ships in D1+. When it lands, swap the click handler for
// onNav("wizard", { lane }).

import type { ReactElement } from "react"
import type { NavParams, Page } from "@/client/navigator"
import type { ShowToast } from "@/client/components/ToastHost"
import { PolicyRulesBanner } from "@/client/components/PolicyRulesBanner"
import {
  AdsLaneIcon,
  AsoLaneIcon,
  LaneCtaCard,
  type LaneId,
} from "@/client/home/LaneCtaCard"
import { SavedStylesShelf } from "@/client/home/SavedStylesShelf"

export interface HomeProps {
  onNav: (page: Page, params?: NavParams) => void
  showToast: ShowToast
}

export function Home({ onNav, showToast }: HomeProps): ReactElement {
  const onLaneClick = (lane: LaneId): void => {
    showToast({
      variant: "info",
      message: `Wizard cho lane "${lane}" sẽ ship ở D1+ bro.`,
    })
  }

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-10">
      <PolicyRulesBanner showToast={showToast} />

      <section className="space-y-2 pt-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
          Bắt đầu generate
        </h1>
        <p className="text-slate-400">
          Chọn lane phù hợp — bộ wizard sẽ dẫn từng bước (D1+).
        </p>
      </section>

      <section
        className="grid gap-4 md:grid-cols-2"
        aria-label="Lane entry points"
      >
        <LaneCtaCard
          laneId="ads"
          title="Ads Images"
          subtitle="Meta + Google Ads — visual + copy variants cho ad set."
          colorVariant="violet"
          Icon={AdsLaneIcon}
          onClick={() => onLaneClick("ads")}
        />
        <LaneCtaCard
          laneId="aso"
          title="Google Play ASO"
          subtitle="Phone-frame screenshots cho Play Store listing."
          colorVariant="emerald"
          Icon={AsoLaneIcon}
          onClick={() => onLaneClick("aso")}
        />
      </section>

      <SavedStylesShelf onNav={onNav} />

      <p className="text-xs text-slate-600 pt-4">
        Client: <code className="text-slate-500">localhost:5173</code> · Server:{" "}
        <code className="text-slate-500">127.0.0.1:5174</code>
      </p>
    </main>
  )
}
