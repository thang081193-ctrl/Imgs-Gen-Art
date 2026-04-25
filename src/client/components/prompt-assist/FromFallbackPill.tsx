// Session #40 Phase B2 — yellow pill that flags `fromFallback: true`
// results so bro knows the LLM was offline (or no API key) and the
// prompt came from the deterministic template path.

import type { ReactElement } from "react"

export function FromFallbackPill(): ReactElement {
  return (
    <span
      data-testid="from-fallback-pill"
      title="LLM offline — generated from template; refine manually."
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
    >
      <span aria-hidden="true">⚠</span>
      <span>Grok offline — using template</span>
    </span>
  )
}
