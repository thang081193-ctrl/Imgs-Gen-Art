// PLAN-v3 §4.4 — Policy-rules freshness banner (Phase C2, Session #42).
//
// Renders a thin strip at the Home page top when the latest scrape is
// older than 14 days (or never happened). Click "Refresh now" → POST
// /api/policy-rules/rescrape → spinner → toast result. Per-session
// dismiss via sessionStorage.policyBannerDismissed (Q-42.H LOCKED) so
// bro re-sees it next session if the staleness persists.

import { useEffect, useState } from "react"
import type { ReactElement } from "react"

import {
  useRescrapePolicyRules,
  usePolicyRulesStatus,
} from "@/client/api/policy-rules-hooks"
import type { ShowToast } from "./ToastHost"

const DISMISS_KEY = "policyBannerDismissed"

export interface PolicyRulesBannerProps {
  showToast: ShowToast
}

function isDismissedFromSession(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

function persistDismiss(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1")
  } catch {
    // sessionStorage can throw under privacy modes — silently no-op.
  }
}

export function PolicyRulesBanner({
  showToast,
}: PolicyRulesBannerProps): ReactElement | null {
  const { data, refetch } = usePolicyRulesStatus()
  const rescrape = useRescrapePolicyRules()
  const [dismissed, setDismissed] = useState(() => isDismissedFromSession())

  // Re-check session storage when the data first arrives (covers the
  // case where another tab dismissed mid-load).
  useEffect(() => {
    if (data && isDismissedFromSession()) setDismissed(true)
  }, [data])

  if (!data || !data.isStale || dismissed) return null

  const onRefresh = async (): Promise<void> => {
    try {
      const result = await rescrape.submit()
      const okCount = result.ok.length
      const failCount = result.failed.length
      if (okCount > 0 && failCount === 0) {
        showToast({
          variant: "success",
          message: `Đã re-scrape ${okCount} platform — banner sẽ ẩn sau khi reload.`,
        })
      } else if (okCount > 0) {
        showToast({
          variant: "warning",
          message: `Re-scrape ${okCount} ok / ${failCount} fail. Check console for details.`,
        })
      } else {
        showToast({
          variant: "danger",
          message: `Re-scrape thất bại cho cả ${failCount} platform.`,
        })
      }
      refetch()
    } catch (err) {
      showToast({
        variant: "danger",
        message: `Re-scrape lỗi: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  const onDismiss = (): void => {
    persistDismiss()
    setDismissed(true)
  }

  const ageLabel = formatAge(data.daysSince)
  const submitting = rescrape.state === "submitting"

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-md border border-amber-700/60 bg-amber-950/40 px-4 py-2 text-sm text-amber-100"
      data-testid="policy-rules-banner"
    >
      <span className="font-medium">Policy rules</span>
      <span className="text-amber-200/80">
        last scraped {ageLabel} — review the diff khi có thời gian.
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={submitting}
          className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-amber-50 hover:bg-amber-500 disabled:opacity-60"
        >
          {submitting ? "Refreshing…" : "Refresh now"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss policy rules banner"
          className="rounded px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/60"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function formatAge(daysSince: number | null): string {
  if (daysSince === null) return "never"
  if (daysSince === 0) return "today"
  if (daysSince === 1) return "1 day ago"
  return `${daysSince} days ago`
}
