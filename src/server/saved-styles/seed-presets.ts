// Session #37 Phase A1 (PLAN-v3 §6.2 / Q-37.D — thin pointer-doc) —
// boot-time idempotent seeding of the 3 legacy presets.
//
// Per Q-37.D the prompt_template fields are pointer-doc strings: each
// preset names the v1 workflow it routes to + the placeholder set the
// future wizard will fill in. Full prompt expansion (reading the actual
// data/templates/*.json shapes) lands in Phase D1 (Meta Ads backend)
// where the wizard knows which preset is firing.
//
// Idempotency: each preset's `slug` is UNIQUE in the table; we check
// `findBySlug` before insert so re-running the seed (boot N+1) is a
// no-op. Surfaces the inserted/skipped count for boot logging.

import { shortId } from "@/core/shared/id"
import type { SavedStyleInsertInput, SavedStylesRepo } from "./saved-styles-repo"

type PresetSpec = Pick<
  SavedStyleInsertInput,
  "slug" | "name" | "description" | "kind" | "promptTemplate" | "lanes"
>

const PRESETS: PresetSpec[] = [
  {
    slug: "artwork-legacy",
    name: "Artwork (legacy)",
    description: "v1 Artwork workflow — multi-group illustration runs.",
    kind: "preset-legacy",
    promptTemplate:
      "Legacy Artwork preset — routes through v1 workflow `artwork-batch` with group={{group}}. Full template expansion ships in Phase D1.",
    lanes: ["ads.meta", "ads.google-ads"],
  },
  {
    slug: "ad-legacy",
    name: "Ad Production (legacy)",
    description: "v1 Ad Production workflow — single-locale ad creatives.",
    kind: "preset-legacy",
    promptTemplate:
      "Legacy Ad preset — routes through v1 workflow `ad-production` with layout={{layout}} locale={{locale}}. Full template expansion ships in Phase D1.",
    lanes: ["ads.meta", "ads.google-ads"],
  },
  {
    slug: "style-legacy",
    name: "Style DNA (legacy)",
    description: "v1 Style DNA workflow — cross-platform brand DNA generator.",
    kind: "preset-legacy",
    promptTemplate:
      "Legacy Style preset — routes through v1 workflow `style-dna` with dna_id={{dna_id}}. Full template expansion ships in Phase D1.",
    lanes: ["ads.meta", "ads.google-ads", "aso.play"],
  },
]

export interface SeedPresetsResult {
  inserted: string[]
  skipped: string[]
}

export function seedPresetsIfNeeded(repo: SavedStylesRepo): SeedPresetsResult {
  const result: SeedPresetsResult = { inserted: [], skipped: [] }
  const now = new Date().toISOString()
  for (const preset of PRESETS) {
    if (repo.findBySlug(preset.slug)) {
      result.skipped.push(preset.slug)
      continue
    }
    repo.insert({
      id: shortId("style", 8),
      slug: preset.slug,
      name: preset.name,
      description: preset.description ?? null,
      kind: preset.kind,
      promptTemplate: preset.promptTemplate,
      previewAssetId: null,
      lanes: preset.lanes,
      createdAt: now,
      updatedAt: now,
    })
    result.inserted.push(preset.slug)
  }
  return result
}

export function listPresetSlugs(): string[] {
  return PRESETS.map((p) => p.slug)
}
