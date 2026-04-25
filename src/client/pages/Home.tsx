// S#38 PLAN-v3 §1 — Home rewrite. The old single "Run a workflow" CTA is
// replaced by 3 LaneCtaCards (one per platform: Meta / Google / Play)
// plus a Saved Styles shelf. The status pill + version strip live in
// the AppHeader now, so this page focuses purely on lane-first nav.
//
// S#44 D2 → F2 — All 3 lane CTAs (Meta/Google/Play) now navigate to
// their wizards. The legacy toast handler from D2 is retired with F2.

import type { ReactElement } from "react"
import type { NavParams, Page } from "@/client/navigator"
import type { ShowToast } from "@/client/components/ToastHost"
import { PolicyRulesBanner } from "@/client/components/PolicyRulesBanner"
import {
  AdsLaneIcon,
  AsoLaneIcon,
  GoogleAdsLaneIcon,
  LaneCtaCard,
} from "@/client/home/LaneCtaCard"
import { SavedStylesShelf } from "@/client/home/SavedStylesShelf"

export interface HomeProps {
  onNav: (page: Page, params?: NavParams) => void
  showToast: ShowToast
}

export function Home({ onNav, showToast }: HomeProps): ReactElement {
  return (
    <main className="mx-auto max-w-6xl p-6 space-y-10">
      <PolicyRulesBanner showToast={showToast} />

      <section className="space-y-2 pt-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
          Bắt đầu generate
        </h1>
        <p className="text-slate-400">
          Chọn lane phù hợp — bộ wizard sẽ dẫn từng bước.
        </p>
      </section>

      <section
        className="grid gap-4 md:grid-cols-3"
        aria-label="Lane entry points"
      >
        <LaneCtaCard
          laneId="meta-ads"
          title="Meta Ads"
          subtitle="Feed + Stories + Reels — visual variants cho Meta ad set."
          colorVariant="blue"
          Icon={AdsLaneIcon}
          onClick={() => onNav("wizard-meta-ads")}
        />
        <LaneCtaCard
          laneId="google-ads"
          title="Google Ads"
          subtitle="Headlines + descriptions text-only ad variants."
          colorVariant="sky"
          Icon={GoogleAdsLaneIcon}
          onClick={() => onNav("wizard-google-ads")}
        />
        <LaneCtaCard
          laneId="play-aso"
          title="Google Play ASO"
          subtitle="Phone-frame screenshots cho Play Store listing."
          colorVariant="emerald"
          Icon={AsoLaneIcon}
          onClick={() => onNav("wizard-play-aso")}
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
