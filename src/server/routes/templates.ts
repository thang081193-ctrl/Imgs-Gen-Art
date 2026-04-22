// BOOTSTRAP-PHASE3 Step 5 — /api/templates read-only routes.
//
// Six GET endpoints return the Phase 2 extracted templates (data/templates/
// *.json), served from the in-process memo cache populated at boot via
// preloadAllTemplates(). Any corrupted JSON would have failed startup, so
// these handlers are pure memory reads.
//
// Session #13 Q5 — read-only enforcement: only GET is registered. Non-GET
// methods fall through to Hono's default 404; the stubs route (mounted
// after this) does NOT catch `/templates/*` anymore (it's removed from
// STUB_DOMAINS), so no custom `route.all(...)` catch is needed.
//
// URL convention: the `copy-templates` JSON file is exposed at /copy (per
// BOOTSTRAP Step 5 deliverable) — keeps the URL tidy ("copy" is the
// user-facing concept; "-templates" is a file-naming artifact).

import { Hono } from "hono"
import {
  getAdLayouts,
  getArtworkGroups,
  getCopyTemplates,
  getCountryProfiles,
  getI18n,
  getStyleDna,
} from "@/server/templates"

export function createTemplatesRoute(): Hono {
  const route = new Hono()

  route.get("/artwork-groups",   (c) => c.json(getArtworkGroups()))
  route.get("/ad-layouts",       (c) => c.json(getAdLayouts()))
  route.get("/country-profiles", (c) => c.json(getCountryProfiles()))
  route.get("/style-dna",        (c) => c.json(getStyleDna()))
  route.get("/i18n",             (c) => c.json(getI18n()))
  route.get("/copy",             (c) => c.json(getCopyTemplates()))

  return route
}
