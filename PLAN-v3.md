# PLAN-v3 — Creative Studio (Ads + ASO lanes)

Forward-looking design doc for the v2 pivot from "4-workflow gen tool"
to a **2-lane creative studio** for Ads Images and Google Play ASO with
platform-specific policy guards, Grok LLM prompt authoring, and a
redesigned JM-Studio-vibe header.

- **Status:** draft written Session #36 (2026-04-25).
- **Supersedes:** navigational + IA parts of PLAN-v2.2.1.md (kept as v1
  blueprint for historical reference).
- **Scope:** v2 only. Video gen + App Store ASO + multi-user defer v3+.

---

## §0 — Context + goals

### Why pivot

Session #35 dogfood surfaced that the 4-workflow split (Artwork · Ad ·
Style · ASO Screenshots) confuses first-time users and buries the
actual jobs bro uses the tool for:

1. Produce **paid-ad creatives** that survive Meta / Google Ads review.
2. Produce **Google Play Store listing assets** (feature graphic,
   screenshots, icon) that pass Play Console submission.

The v1 workflow taxonomy optimised for *generation recipe* variety.
The v2 pivot optimises for **user job**: pick a lane, answer a few
platform-aware questions, get policy-safe assets.

### Goals

- **G1 — Lane-first IA.** Home = 2 giant CTAs + Saved Styles shelf.
- **G2 — Policy guardrails.** Scraped + hand-curated rule library per
  platform, enforced at gen-time, audited per asset.
- **G3 — LLM-assisted prompts.** Grok adapter powers reverse-from-image,
  idea-to-prompt, and text-overlay brainstorming.
- **G4 — Saved Styles as first-class.** 3 legacy workflows migrate to
  preset rows. Users can save + reuse.
- **G5 — Preserve v1 data.** No wipe of gallery, assets, profiles,
  history. Backward-compat preserved.
- **G6 — Forward-compat video slot.** Header reserves nav space for a
  v3+ Video lane.

### Non-goals (v2)

See §8.

---

## §1 — Information architecture

### §1.1 Home

```
┌────────────────────────────────────────────────────────────────┐
│ [LOGO 48px]  Creative Studio                   [ok Sẵn sàng]  │
│              Ads Images · Google Play ASO                      │
│              v2.0.0 · #abc1234 · last gen 2h ago               │
├────────────────────────────────────────────────────────────────┤
│ [icon Profiles] [icon Specs] [icon Gallery] [icon Settings]    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌───────────────────────┐  ┌───────────────────────┐         │
│   │                       │  │                       │         │
│   │    ADS IMAGES         │  │    GOOGLE PLAY ASO    │         │
│   │    Meta · Google      │  │    Store listing      │         │
│   │                       │  │                       │         │
│   │    [Start →]          │  │    [Start →]          │         │
│   └───────────────────────┘  └───────────────────────┘         │
│                                                                │
│   Your Saved Styles                              [+ New]       │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                          │
│   │ Art  │ │ Ad   │ │Style │ │User1 │ …                        │
│   │legacy│ │legacy│ │legacy│ │      │                          │
│   └──────┘ └──────┘ └──────┘ └──────┘                          │
└────────────────────────────────────────────────────────────────┘
```

- **Ads Images CTA** → wizard Step 2 shows platform picker (Meta /
  Google Ads). No hover sub-menu on home — keeps mobile simple.
- **Google Play ASO CTA** → wizard skips Step 2 (single platform).
- **Saved Styles shelf** = grid of cards (see §6). Click card opens
  wizard Step 3 pre-filled with `saved-style` input mode.

### §1.2 Creative Project wizard

4 linear steps, back button always available, state persisted in
`creative_projects` table (nullable row until Step 4 fires gen).

```
Step 1  Lane          → ads | aso
Step 2  Platform      → (ads) meta | google-ads  ·  (aso) skip (play)
Step 3  Input mode    → (lane-dependent, see table below)
Step 4  Gen config    → concepts count · locale · ratio · saved-style
```

Input modes per lane:

| Lane  | Platform    | Input modes                                                    |
|-------|-------------|----------------------------------------------------------------|
| ads   | meta        | upload-ref · text-idea · text-overlay · saved-style            |
| ads   | google-ads  | upload-ref · text-idea · text-overlay · saved-style            |
| aso   | play        | app-description · keyword-seed · existing-screenshots · saved-style |

### §1.3 Gallery (unchanged structurally, add lane filter)

- Add `lane` filter pill row above existing tag filter: `all · ads ·
  aso · legacy`.
- Existing assets default to `lane = 'legacy'` via one-time migration
  column add (`assets.lane TEXT DEFAULT 'legacy'`).
- New gen rows stamp `lane` from wizard Step 1.

### §1.4 Saved Styles (new top-level entity)

See §6 for data model. UX:

- **Shelf on Home** — grid of cards, `preset-legacy` and user-created
  rows both rendered the same, distinguished by pill badge.
- **Detail route** `/saved-styles/:id` — preview asset, prompt
  template, usage count, lane compatibility tags, edit/delete (user
  rows only; presets read-only).
- **Use from wizard** — Step 3 "Saved Style" input mode opens picker
  filtered by current lane/platform.

---

## §2 — Creative Project flow (per-step UX + data)

### Step 1 — Lane

2 card buttons. Writes `creative_projects.lane` (`ads` | `aso`).

### Step 2 — Platform

- **Ads:** 2 card buttons (Meta / Google Ads). Writes `platform`
  (`meta` | `google-ads`).
- **ASO:** auto-select `play`, skip UI, advance to Step 3. Row stores
  `platform = 'play'`.

### Step 3 — Input mode

Lane/platform dependent (see §1.2 table). Each mode has its own form
partial:

- **upload-ref:** drop zone + optional headline text. Grok reverse-
  from-image runs automatically, fills prompt draft.
- **text-idea:** textarea + Grok `ideaToPrompt` button.
- **text-overlay:** upload image + headline + Grok brainstorm 5
  variants, user picks one.
- **saved-style:** picker of `saved_styles` rows matching lane.
- **app-description:** textarea (ASO only).
- **keyword-seed:** tag input (ASO only).
- **existing-screenshots:** upload 1-3 screenshots (ASO only).

### Step 4 — Gen config

- Concepts count (1-4 slider).
- Locale picker (reuses v1 locale selector from ad-production).
- Aspect ratio (platform-constrained: Meta feed = 1:1 / 4:5 / 9:16;
  Google Ads = 1:1 / 1.91:1; Play ASO = per-asset-kind fixed).
- Saved-style preset dropdown (optional).
- **Policy preflight** badge shows pass/warning/block before "Generate"
  button activates (see §4.3).

Fire → backend builds prompt, checks policy, calls Vertex, writes
assets + history.

---

## §3 — LLM prompt-suggester service

> **Architecture revision (S#44 mega-close, 2026-04-25 — Q-44.K):**
> S#39 Phase B1 split the prompt-suggester into a provider-agnostic
> seam (`services/llm/`) + a use-case layer (`services/prompt-assist/`).
> The original §3 spec described a single `services/grok.ts` file —
> that name no longer exists. Grok is now one impl behind
> `LLMProvider`; adding OpenAI / Anthropic / Gemini-text = ship one
> file each, no use-case rewrites. Policy enforcement (C1–C3 +
> D1/E/F1) lives in its own sibling layer (`services/policy-rules/`)
> because it has no LLM dependency and ships with a different
> lifecycle (hand-curated + scraped JSON, not API calls).

### §3.1 Three-layer service split

```
src/server/services/
├── llm/                    transport / vendor-agnostic seam
│   ├── types.ts            LLMProvider, LLMChatRequest, LLMChatResponse
│   ├── registry.ts         getActiveLLMProvider(), LLMProviderName union
│   ├── grok-provider.ts    LLMProvider impl backed by xAI Grok
│   ├── grok-config.ts      env-var read at provider construction
│   ├── grok-fetch.ts       OpenAI-compat HTTP call
│   ├── grok-retry.ts       1-retry-on-429/5xx with backoff
│   ├── mime-sniff.ts       image-part MIME detection for vision input
│   ├── errors.ts           LLMProviderError + cause chain
│   └── index.ts            barrel — exports getActiveLLMProvider() +
│                           LLMProvider type only
├── prompt-assist/          use-case layer; consumes LLMProvider
│   ├── idea-to-prompt.ts   text → prompt draft
│   ├── reverse-from-image.ts  image → re-generatable prompt
│   ├── text-overlay-brainstorm.ts  image+headline → 5 overlay variants
│   ├── fallback-composer.ts  template-based idea-to-prompt floor
│   ├── fallback-overlay.ts   template-based overlay floor
│   ├── fallback-reverse.ts   template-based reverse floor
│   ├── log.ts              per-call jsonl writer (logs/llm.jsonl)
│   ├── types.ts
│   └── index.ts            barrel
└── policy-rules/           policy enforcement (C1–C3 + D/E/F)
    ├── loader.ts           hand-curated + scraped merge layer
    ├── scraper.ts          C2 source-fetch with bi-weekly freshness
    ├── sources.ts          per-platform source URL table
    ├── check-policy.ts     C3 aggregator (pure)
    ├── checkers/           6 per-kind impls (text-area-ratio,
    │                       keyword-blocklist, aspect-ratio,
    │                       file-size-max, resolution-min, claim-regex)
    ├── build-check-input.ts  S#44 — per-platform PolicyCheckInput
    │                       mappers (Meta + Google Ads + Play)
    └── index.ts            barrel
```

### §3.2 LLMProvider contract

```ts
// src/server/services/llm/types.ts
export interface LLMProvider {
  readonly name: string
  readonly model: string
  chat(req: LLMChatRequest): Promise<LLMChatResponse>
}

export interface LLMChatRequest {
  messages: LLMMessage[]    // OpenAI-compat shape
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}
```

- **Active provider** resolved via `getActiveLLMProvider()` (returns
  `LLMProvider | null`; null = no provider configured → caller falls
  back to the prompt-assist template floor).
- **Selection** via `LLM_PROVIDER` env var (default = `grok`).
- **Adding a vendor:** ship `services/llm/<vendor>-provider.ts`
  implementing `LLMProvider`, register in `registry.ts`. Use cases
  never import vendor SDKs.
- **Per-vendor config** (Grok-specific knobs that locked at S#36):
  - Env var: `XAI_API_KEY` (never committed, in `.env`, gitignored).
  - Model: `grok-4-1-fast-reasoning` (Q-36.B).
  - Endpoint: `https://api.x.ai/v1/chat/completions` (OpenAI-compat).
  - Timeout: 30s hard per request via `AbortController` (Q-36.H).
  - Retry: 1 retry on 429 / 5xx / network error with 1s backoff.
- **Logging:** `{provider, model, inputTokens?, outputTokens?,
  latencyMs, outcome}` per call to `logs/llm.jsonl` (was `grok.jsonl`
  before S#39 — renamed for vendor-neutrality).

### §3.3 Use-cases (prompt-assist layer)

```ts
// All 3 return { prompt: string, notes?: string[], tokens?: {in,out} }

reverseFromImage(imageBuffer, opts?: { lane, platform })
  → vision input (base64 data URL); system prompt instructs the LLM to
    produce a re-generatable prompt describing subject, style,
    composition, palette, mood.

ideaToPrompt(idea: string, lane, platform)
  → text-only. System prompt includes platform conventions (e.g. Meta
    feed = square, avoid >20% text; Google Ads = headline-forward).

textOverlayBrainstorm(imageBuffer | description, headline?)
  → returns array of 5 short overlay variants (≤8 words each), with
    tone labels (bold · playful · minimal · urgency · social-proof).
```

Each use-case calls `getActiveLLMProvider()` lazily — null providers
short-circuit to the template floor without burning a fetch.

### §3.4 Fallback (template floor)

If the LLM call fails (timeout, 5xx, API key missing) OR no provider
is registered:

- Return `{ prompt: <template-based draft>, notes: ['LLM unavailable,
  using template fallback'], fromFallback: true }`.
- Toast on client: "LLM offline — dùng template, bạn có thể edit tay".
- Template floor lives in `services/prompt-assist/fallback-*.ts` (one
  per use case — `fallback-composer.ts`, `fallback-overlay.ts`,
  `fallback-reverse.ts`).
- Don't delete v1 prompt builders; they ARE the floor.

The `google-ads` workflow runner (S#44 Phase E) reuses the same
"null provider → deterministic synth" pattern via
`synthesizeGoogleAdsResponse` in `workflows/google-ads/prompt-composer.ts`
— different shape (full ad-set instead of single prompt) but same
philosophy: never block a batch on missing LLM.

---

## §4 — Policy guard layer

### §4.1 Rule schema

One JSON doc per platform, two layers (scraped + hand-curated). Shared
schema:

```ts
type PolicyRule = {
  id: string;                    // stable, e.g. 'meta-ads-text-density-001'
  platform: 'meta' | 'google-ads' | 'play';
  format?: string;               // optional, e.g. 'feed' | 'reels'
  category: string;              // 'text-density' | 'claims' | 'imagery' | ...
  description: string;           // human-readable
  severity: 'warning' | 'block';
  pattern: PolicyPattern;        // union of detection shapes, see §4.1.1
  sourceUrl?: string;            // doc URL the rule came from
  lastReviewedAt: string;        // ISO date
  source: 'scraped' | 'hand-curated';
};
```

### §4.1.1 Pattern kinds (v2)

- `{ kind: 'text-area-ratio', max: number }` — OCR-estimate text area.
- `{ kind: 'keyword-blocklist', terms: string[] }` — prompt text match.
- `{ kind: 'aspect-ratio', allowed: string[] }` — enforce format.
- `{ kind: 'file-size-max', bytes: number }` — post-render check.
- `{ kind: 'resolution-min', w: number, h: number }` — post-render.
- `{ kind: 'claim-regex', pattern: string, flags?: string }` — overly-
  absolute claims ("best ever", "100% guaranteed").

New kinds added in v2+ go through a code change; rule JSON doesn't
encode executable logic.

### §4.2 Scraper + hand-curated overrides

**Directory layout:**

```
policy-rules/
  scraped/
    meta.json            regenerated by scraper, last-scraped stamped
    google-ads.json
    play-aso.json
  hand-curated/
    meta.json            hand-edited, tracks custom restrictions
    google-ads.json
    play-aso.json
  merged.cache.json      generated on boot, union with hand-curated wins
```

**Scraper:** `scripts/scrape-policy-rules.ts`

- One function per platform: `scrapeMeta()`, `scrapeGoogleAds()`,
  `scrapePlayAso()`.
- Uses `cheerio` (already in deps? if not, add — bump to confirm at
  S#41 start).
- Heuristics + hard-coded starting URLs per platform. Extracts
  rule-shaped blocks, normalises to `PolicyRule` schema, stamps
  `source: 'scraped'`.
- Writes `scraped/<platform>.json` with `{ scrapedAt, rules: [...] }`.
- CLI: `npm run scrape-policies` (all 3) or
  `npm run scrape-policies -- --platform=meta`.

**Hand-curated layer (locked Q-36.F):**

- Bro edits `hand-curated/<platform>.json` by hand when the scraper
  misses something or bro wants a stricter internal rule.
- Same schema, `source: 'hand-curated'`.
- Merge: hand-curated wins on `id` collision (override); union on
  non-collision.

### §4.3 Bi-weekly ping + audit trail

(Q-37.I — `policy_decision_json` lives on `batches`, not `assets` or a
fictional `history` table. One preflight per gen run = one batch row =
one audit blob; avoids duplicate JSON across N assets per batch.)

**Bi-weekly scrape ping (locked Q-36.C refined):**

- Server tracks `policy_rules.lastScrapedAt` in `settings` table
  (key-value table, see §6 if not exists — if not, create in A1).
- On app boot + once per day thereafter, if
  `now - lastScrapedAt > 14 days`, surface banner on Home:
  "Chính sách có thể đã lỗi thời, click re-scrape" + button → fires
  `POST /api/policy-rules/rescrape`.
- Banner dismissible for the session; re-appears next day until
  scraped.

**Enforcement point:**

- At wizard Step 4, before "Generate" button activates, backend runs
  `checkPolicy(prompt, platform, format)` → returns
  `{ outcome, rules: [matchedRule], warnings, blocks }`.
- `outcome = 'pass' | 'warning' | 'blocked'`.
- Block → button disabled + list of violations with rule IDs + source
  URLs.
- Warning → button live, prefixed with "Review required" badge, user
  confirm dialog on click.
- User override (locked Q-36.C) — dialog offers "Override with
  reason" input; writes `policy_decisions.override_reason`.

**Audit trail:**

- `batches.policy_decision_json TEXT NULL` — new column, added in A1
  (Q-37.I locked 2026-04-25 — batch-level audit, not per-asset).
- Blob shape:

```json
{
  "checkedAt": "2026-04-25T09:30:00Z",
  "platform": "meta",
  "format": "feed",
  "outcome": "warning",
  "rulesMatched": [
    { "id": "meta-ads-text-density-001", "severity": "warning",
      "source": "scraped" }
  ],
  "override": { "by": "user", "reason": "Internal launch, reviewed" }
}
```

---

## §5 — Header + homepage redesign

### §5.1 Layout spec

- **Logo:** JM Studio mark, 48×48 desktop / 32×32 mobile. Left-most.
- **Title block:** 2 lines to the right of logo.
  - Line 1 (H1): `Creative Studio` — Inter Variable 28px/700.
  - Line 2 (subtitle): `Ads Images · Google Play ASO` — 14px/500,
    muted colour.
- **Version strip:** right-aligned below title. 12px muted.
  - `v{package.json version} · #{git short SHA} · last gen {rel time}`.
  - Git SHA injected at build time via Vite define.
  - Last-gen time polled from `/api/health/last-gen` (new endpoint in
    A1 — or reuse existing if present; check at S#37 start).
- **Status pill:** far right. Polls `/api/health` every 30s.
  - Green dot + "Sẵn sàng" on 200.
  - Amber dot + "Degraded" on slow response (>2s).
  - Red dot + "Lỗi" on fail.

### §5.2 Nav pills row (below header)

- `[Profiles] [Specs] [Gallery] [Settings]` (each with inline SVG leading icon)
- Reserved forward-compat slot between Gallery and Settings for v3+
  Video lane — rendered only when `VIDEO_LANE_ENABLED` flag set (not
  shipped in v2).
- Icons inline SVG, stroke-only, 16px.

### §5.3 File layout

- `src/client/components/AppHeader.tsx` (new or rewrite if exists).
- `src/client/components/NavPillBar.tsx` (new).
- `src/client/components/StatusPill.tsx` (new).
- `src/client/home/LaneCtaCard.tsx` (new, 1 component, 2 instances).
- `src/client/home/SavedStylesShelf.tsx` (new).

A2 LOC budget estimate: ~250-280 across 5 files. Each file ≤ soft cap.

---

## §6 — Saved Styles data model + migration

### §6.1 `saved_styles` table

```sql
CREATE TABLE saved_styles (
  id             TEXT PRIMARY KEY,      -- uuid
  slug           TEXT UNIQUE NOT NULL,  -- 'artwork-legacy' | 'ad-legacy' | 'style-legacy' | user kebab
  name           TEXT NOT NULL,
  description    TEXT,
  kind           TEXT NOT NULL,         -- 'preset-legacy' | 'user'
  prompt_template TEXT NOT NULL,        -- {{placeholder}}-templated
  preview_asset_id TEXT,                -- FK assets.id, nullable
  lanes_json     TEXT NOT NULL,         -- JSON array, e.g. ["ads.meta","ads.google-ads"]
  usage_count    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,         -- Q-37.J: TEXT ISO (matches assets/batches)
  updated_at     TEXT NOT NULL,         -- Q-37.J: TEXT ISO
  FOREIGN KEY (preview_asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

CREATE INDEX idx_saved_styles_kind ON saved_styles(kind);
```

### §6.2 One-time migration (ships A1)

File: `scripts/migrations/2026-04-25-saved-styles.sql` (Q-37.H — corrected
from earlier numbered-TS spec to dated-SQL pattern that matches the four
existing migrations under `scripts/migrations/`).

Steps:

1. `CREATE TABLE IF NOT EXISTS saved_styles ...` (idempotent).
2. If `SELECT count(*) FROM saved_styles WHERE kind='preset-legacy'` = 0:
   - Insert 3 rows: `artwork-legacy`, `ad-legacy`, `style-legacy`.
   - `prompt_template` extracted from v1 workflow prompt builders. Pin
     exact source lines in PR description (at S#37).
   - `lanes_json`:
     - Artwork → `["ads.meta","ads.google-ads"]`
     - Ad → `["ads.meta","ads.google-ads"]`
     - Style → `["ads.meta","ads.google-ads","aso.play"]`
3. Add `batches.policy_decision_json TEXT NULL` if not exists (Q-37.I).
4. Add `assets.lane TEXT DEFAULT 'legacy' NOT NULL` if not exists.
5. Create `settings` table (key-value) if not exists; seed
   `policy_rules.lastScrapedAt = '1970-01-01T00:00:00Z'` to force
   first-boot banner.

### §6.3 ASO Screenshots retirement

- **Backend assets untouched.** Existing ASO-Screenshots-generated
  assets keep their rows + files.
- **Frontend route removed** in A2: delete
  `src/client/workflows/aso-screenshots/*` and its route registration.
- **Gallery filter** keeps `lane='legacy'` for historical rows, so
  they remain browsable.
- **No data migration** (per Q-10c locked: preserve gallery).

---

## §7 — Phase delivery plan

Each phase = one session (or two if backend/frontend split per
feedback rule). All phases keep regression green at session close.

| # | Session | Phase                       | Scope                                                  | Est |
|---|---------|-----------------------------|--------------------------------------------------------|-----|
| 1 | S#37    | **A1 backend**              | saved_styles table + migration 020 + REST endpoints    | 1.5h |
| 2 | S#38    | **A2 frontend**             | AppHeader + Home CTAs + SavedStylesShelf + ASO retire  | 2.5h |
| 3 | S#39    | **B1 Grok backend**         | grok.ts adapter + 3 endpoints + fallback + logs        | 1.5h |
| 4 | S#40    | **B2 Prompt-Lab UI**        | Wizard Step 3 Grok buttons + text-overlay picker       | 2h   |
| 5 | S#41    | **C1 Policy schema**        | policy-rules/ layout + hand-curated seed + merger      | 1h   |
| 6 | S#42    | **C2 Scraper + ping**       | scripts/scrape-policy-rules.ts + bi-weekly banner      | 2h   |
| 7 | S#43    | **C3 Enforcement + audit**  | checkPolicy() + Step 4 preflight + audit trail         | 2h   |
| 8 | S#44    | **D1 Meta Ads backend**     | Wizard persistence + policy wiring + Vertex call       | 2h   |
| 9 | S#45    | **D2 Meta Ads frontend**    | 4-step wizard UI + preflight badge                     | 2.5h |
|10 | S#46    | **E Google Ads lane**       | Reuse D infra + Google-specific rules + ratios         | 2h   |
|11 | S#47    | **F1 Play ASO backend**     | app-description · keyword-seed · existing-screenshots  | 2h   |
|12 | S#48    | **F2 Play ASO frontend**    | ASO wizard UI + asset-kind picker                      | 2h   |

**Total:** ~23h across 12 sessions.

**Per-session protocol (carryover from v1):**

- Pre-alignment Qs before firing code.
- <300 content LOC hard cap (250 soft).
- Pin exact versions, no new deps without asking.
- Regression green at close.
- Show evidence before claiming done.

**Inter-phase checkpoints:**

- After Phase A (S#38): dogfood home + saved styles, no regressions.
- After Phase B (S#40): Grok 3 use-cases smoke-tested manually.
- After Phase C (S#43): policy blocks + warnings fire on sample
  prompts, audit rows appear in history.
- After Phase D (S#45): end-to-end Meta Ads gen with policy pass.
- After Phase F (S#48): v2 GA. Bro dogfoods 1 week, then PLAN-v3
  closes.

---

## §8 — Out-of-scope (v3+ carry-forward)

- Video generation (entire lane).
- App Store ASO.
- Multi-user auth + team collab.
- Grok rate cap UI (local-only, per Q-36.H).
- Tree view via `parentHistoryId`.
- Side-by-side diff panel.
- Cursor-based pagination.
- Profile import UI.
- 3-way merge UI.
- Bulk profile operations.
- Profile list search / filter.
- Read-only profile view route.
- Bulk delete cross-page selection.
- Sharp-derived icon-only favicon crop (from S#33 carry-over).
- `jm-*` semantic class migration (gated).
- §C1 `asset_tags` JOIN migration.

---

## §J — DECISIONS log (locked)

All Qs locked unless marked otherwise. Dates in ISO.

### From Session #35 pre-align (locked 2026-04-24)

| Q      | Decision                                                                            |
|--------|-------------------------------------------------------------------------------------|
| Q-1    | Platforms: Meta · Google Ads · Google Play ASO (all 3, phased).                     |
| Q-2    | LLM provider: Grok (xAI) — cheaper + larger context + bro has key.                  |
| Q-3    | Policy: strict block + researched rules + user override layer.                      |
| Q-4    | ASO platforms: Google Play only v2; App Store → v3+.                                |
| Q-5    | Header: JM Studio Meta/TikTok Converter vibe (logo, 2-line title, version strip).   |
| Q-6    | v1 workflows: Artwork + Ad + Style → Saved Styles presets; ASO Screenshots retired. |
| Q-7    | Delivery: phased, rules cũ (clean/lean/module/QA/regression).                       |
| Q-10a  | Home CTAs: 2 primary (Ads Images / ASO). Ads fans into Meta + Google sub-nav.       |
| Q-10b  | Home section: "Your Saved Styles" lists 3 legacy presets + user rows.               |
| Q-10c  | Data: preserve gallery + assets; no wipe.                                           |

### From Session #36 pre-align (locked 2026-04-25 unless noted)

| Q      | Decision                                                                            |
|--------|-------------------------------------------------------------------------------------|
| Q-36.A | PLAN-v3.md sits side-by-side with PLAN-v2.2.1.md. No migration of v2.2.1 content.   |
| Q-36.B | Grok model: `grok-4-1-fast-reasoning`. Key via `XAI_API_KEY` env var.               |
| Q-36.C | Policy rules: scraped + hand-curated overrides. Bi-weekly re-scrape ping to user.   |
| Q-36.D | Saved Styles migration: ships Phase A1 alongside IA/header rework.                  |
| Q-36.E | Header redesign: Phase A2 from day one, JM Studio Meta/TikTok Converter ref.        |
| Q-36.F | Policy layering: scraper as base + hand-curated overrides for extra restrictions.   |
| Q-36.G | Phase A split: A1 backend (saved_styles + migrations) → A2 frontend.                |
| Q-36.H | Grok cost guardrail: **no rate cap**. 30s per-request timeout only. Local project.  |

### From Session #37 pre-align (locked 2026-04-25)

| Q      | Decision                                                                            |
|--------|-------------------------------------------------------------------------------------|
| Q-37.A | Migration filename: `2026-04-25-saved-styles.sql` (sort-after `prompt-history`).    |
| Q-37.D | Preset `prompt_template` = thin pointer-doc string in A1; full expansion in D1.     |
| Q-37.H | §6.2 spec corrected: `scripts/migrations/<date>-saved-styles.sql` (not numbered TS). |
| Q-37.I | `policy_decision_json` lives on `batches` (per-batch audit), not `assets`/`history`. |
| Q-37.J | `saved_styles.created_at`/`updated_at` use TEXT ISO (matches assets/batches/etc), not INTEGER from PLAN draft. |

---

*PLAN-v3 drafted Session #36, 2026-04-25. First code session = S#37
(Phase A1 backend). Supersedes v1 IA but preserves v1 data. Regression
baseline at draft close: 713 pass / 10 skipped / 1 todo / 724 total.*
