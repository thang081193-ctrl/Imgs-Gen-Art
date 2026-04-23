// Minimal in-process router. Three pages + optional params (batchId for the
// Gallery "view in gallery after cancel" CTA). No react-router-dom — a Page
// union + setState-backed `go` is enough for Phase 3.
//
// Params stay scoped per navigation; `go()` replaces both page and params.

export type Page = "home" | "workflow" | "gallery" | "settings"

export interface NavParams {
  batchId?: string
}

export interface Navigator {
  page: Page
  params: NavParams
  go: (page: Page, params?: NavParams) => void
}
