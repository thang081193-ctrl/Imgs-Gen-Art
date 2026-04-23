// Minimal in-process router. Pages + optional params (batchId for the
// Gallery "view in gallery after cancel" CTA; assetId for the PromptLab
// entry from the asset detail modal). No react-router-dom — a Page union
// + setState-backed `go` is enough through Phase 5.
//
// Params stay scoped per navigation; `go()` replaces both page and params.

export type Page = "home" | "workflow" | "gallery" | "settings" | "prompt-lab"

export interface NavParams {
  batchId?: string
  assetId?: string
}

export interface Navigator {
  page: Page
  params: NavParams
  go: (page: Page, params?: NavParams) => void
}
