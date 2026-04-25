# Session #39 Handoff — Phase B1 backend (Grok adapter + 3 endpoints + fallback + logs)

Paste at the start of S#39 to resume cleanly on any PC. Backend-only
session per PLAN-v3 §3 + §7 row 3. UI consumer (Wizard Step 3 buttons +
text-overlay picker) ships separately in S#40 B2.

Approach B — pre-align Qs pre-filled with best-guess answers; bro skim
+ correct + fire.

---

## Where we stopped (end of Session #38 — 2026-04-25)

- **Phase A2 frontend shipped + pushed.** Commit `a97392e` on
  `origin/main`. 29 files, +2264 / -362.
- **Regression:** **747 pass / 10 skipped / 1 todo / 758 total** (vs
  S#37 baseline 725 / 736 → +22 from 19 component tests + 3 health
  integration tests).
- **Decisions locked S#38** (PLAN-v3 §J entries to add when next docs
  pass lands): Q-38.A through Q-38.L. See `phase_status.md` memory for
  full table.
- **What landed visually:** AppHeader (3-column · brand + NavPillBar +
  version strip + StatusPill + theme toggle) · 2 LaneCtaCards on Home ·
  SavedStylesShelf · saved-style-detail page · ASO Screenshots client
  retired (server route untouched per Q-10c).
- **Backend additions:** `/api/health.lastGenAt` (Q-38.C) · build-time
  `__GIT_SHA__` define · vitest jsdom + RTL + jest-dom test infra.
- **Git tree:** S#38 commit on top of `origin/main`. Run `git log
  --oneline -3` to confirm before firing B1.

## Current repo state (verify before firing B1)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -5    # expect a97392e (S#38 A2) on top
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 747 / 758 (or 747 + N new B1 tests)
```

Current Grok-related state: **none**. No `XAI_API_KEY` in `.env`,
no `src/server/services/` directory, no Grok references anywhere
in source. B1 is greenfield within an established adapter pattern
(see `src/server/providers/gemini.ts` + `vertex-imagen.ts` for the
shape — but Grok ≠ image provider, see Q-39.A).

---

## Priority pick — S#39: Phase B1 Grok adapter

### Goal

Land the Grok service module + 3 use-case functions + 3 REST endpoints
+ template fallback + JSONL logging. Backend-only. UI consumption
ships in S#40 B2.

### Deliverables

1. **Grok service module** —
   `src/server/services/grok.ts` (NEW dir per PLAN-v3 §3.1). Exports:
   - `reverseFromImage(imageBuffer, opts?: { lane?, platform? })`
   - `ideaToPrompt(idea: string, lane, platform)`
   - `textOverlayBrainstorm(input: { image?: Buffer, description?: string, headline? })`
   All return `{ prompt: string, notes?: string[], tokens?: { in, out },
   fromFallback?: true }`. Internal `callGrok()` helper wraps fetch +
   30s `AbortController` + 1-retry-on-429-or-5xx + JSONL log emit.
2. **REST endpoints** — `src/server/routes/grok.ts` +
   `src/server/routes/grok.body.ts` (zod). Mounted at `/api/grok`:
   - `POST /api/grok/reverse-from-image` — multipart (image file +
     optional lane/platform string fields).
   - `POST /api/grok/idea-to-prompt` — JSON body `{ idea, lane,
     platform }`.
   - `POST /api/grok/text-overlay-brainstorm` — JSON body `{ image?:
     base64dataurl, description?: string, headline?: string }`.
   Validated via zod, errors → 400 BAD_REQUEST per project convention.
3. **Template fallback layer** —
   `src/server/services/grok-fallbacks.ts`:
   - `fallbackReverseFromImage()` returns a generic
     "describe-this-image" pointer prompt with filename hint.
   - `fallbackIdeaToPrompt(idea, lane, platform)` routes through
     existing v1 builders (`src/workflows/artwork-batch/prompt-composer.ts`,
     `ad-production/prompt-composer.ts`) based on lane.
   - `fallbackTextOverlayBrainstorm(headline?)` returns 5 fixed
     templates with tone labels (bold · playful · minimal · urgency ·
     social-proof).
4. **JSONL logger** —
   `src/server/services/grok-log.ts` writes append-only JSONL to
   `data/logs/grok.jsonl` (gitignored). Format per PLAN-v3 §3.1:
   `{ts, model, useCase, latencyMs, inputTokens?, outputTokens?,
   outcome: "ok"|"retry"|"timeout"|"error"|"fallback", error?: string}`.
   No PII (no prompt body in logs).
5. **Env wiring** — `src/server/services/grok-config.ts` reads
   `process.env.XAI_API_KEY` once at first call (lazy, not at boot —
   keeps unit tests that don't touch Grok hermetic). Throws
   `MissingApiKeyError` if absent → service triggers fallback.
6. **Mount** — register `app.route("/api/grok", createGrokRoute())`
   in `src/server/app.ts` after `/api/saved-styles`.
7. **Tests:**
   - `tests/unit/grok.test.ts` — mocked global fetch:
     - happy path each use case · 429 retry-once-then-succeed · 429
       exhausted → fallback · timeout (AbortController) → fallback ·
       missing API key → fallback (no fetch call) · log line shape +
       outcome value per scenario.
   - `tests/integration/grok-routes.test.ts` — full HTTP exercise
     with mocked fetch at module level (`vi.mock("node:fetch", ...)`
     or stub global), covers 200 happy + 400 invalid body + 503 if
     fallback unavailable.
   - `tests/live/grok-live.test.ts` — `describe.skipIf(!XAI_API_KEY)`
     real-API smoke. 3 calls, ≤5s total budget, ≤$0.005 estimated.
     Documents the "ungated live" path. CI never runs it.
8. **Schema files unchanged.** B1 adds no DB tables/columns.
   Grok logs live on-disk, not in SQLite.

### LOC budget

| File | Budget |
|------|--------|
| services/grok.ts                     | ~180 |
| services/grok-fallbacks.ts           | ~120 |
| services/grok-log.ts                 | ~60  |
| services/grok-config.ts              | ~40  |
| services/grok-types.ts               | ~50  |
| routes/grok.ts                       | ~140 |
| routes/grok.body.ts (zod)            | ~80  |
| tests/unit/grok.test.ts              | ~200 |
| tests/integration/grok-routes.test.ts| ~150 |
| tests/live/grok-live.test.ts         | ~80  |
| **Total**                            | **~1100 LOC across 10 files** |

All ≤ soft cap 250. Heaviest = `tests/unit/grok.test.ts`; cap-watch
at midpoint and split into `grok.<use-case>.test.ts` per call if it
runs over.

---

## Pre-align Qs (pre-filled, bro corrects)

**Q-39.A — File location: `services/` vs `providers/`**
- *Pre-filled:* `src/server/services/grok.ts` (NEW dir) per PLAN-v3 §3.1.
  Grok is a text/LLM service, not an image provider; the existing
  `providers/` folder is dedicated to image-gen adapters (Gemini /
  Vertex / Mock) gated by ESLint per-folder import rules. Mixing
  Grok in there pollutes the boundary.
- *Alternative:* `src/server/providers/grok.ts` co-located with
  Gemini/Vertex. Cheaper to find but breaks the semantic split.
- *Recommend:* services/ per PLAN-v3.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-39.B — HTTP client: native fetch vs `openai` SDK**
- *Pre-filled:* native `fetch` + `AbortController` (Node 20 ships
  both). xAI's API is OpenAI-compat but we only use 1 endpoint
  (`/v1/chat/completions`). Adding the `openai` package = +2.5 MB
  install + a runtime dep for ~50 LOC of glue we already have via
  fetch.
- *Alternative:* `openai@4.x` with `baseURL: 'https://api.x.ai/v1'`.
  Worth it if we expect to grow Grok surface area (streaming,
  function-calling). For B1 scope it's overkill.
- *Recommend:* native fetch.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-39.C — Key storage: env var vs encrypted slot**
- *Pre-filled:* env var `XAI_API_KEY` per PLAN-v3 §3.1, read lazily
  at first call. No keys.enc integration. Single-key = no rotation
  benefit; encrypted store is for image-provider keys that might
  rotate per-project.
- *Alternative:* extend `src/server/keys/store.ts` with a `grok`
  slot kind — adds UI/CRUD complexity for zero practical value at
  this scale.
- *Recommend:* env var.
- *Action:* add `.env` to `.gitignore` (likely already there —
  confirm at S#39 start) + ship `.env.example` with `XAI_API_KEY=`
  placeholder.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-39.D — REST endpoint shape: 3 vs 1**
- *Pre-filled:* 3 endpoints (one per use case) at `/api/grok/{name}`.
  Mirrors the 3 service functions 1:1 — each call has a different
  body shape (image-multipart vs JSON), so collapsing into a single
  `/api/grok/suggest` with a `kind` discriminator wastes zod work.
- *Alternative:* 1 dispatcher endpoint with internal switch. Would
  centralise rate-limit / log middleware but we don't have those
  middlewares.
- *Recommend:* 3 endpoints.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-39.E — JSONL log location + redaction**
- *Pre-filled:* `data/logs/grok.jsonl` (new subdir, gitignored).
  Append-only, no rotation in B1 (file stays small — ~100 bytes/line,
  bro can prune monthly). Log shape excludes prompt body and image
  bytes; only `{ts, model, useCase, latencyMs, tokens?, outcome,
  error?}` so the file never leaks user content.
- *Alternative:* pipe into existing `core/shared/logger.ts` (stdout
  JSON). Server logs already go there — adding a 4th category
  noises up the dev console.
- *Recommend:* dedicated file; existing logger reserved for HTTP +
  workflow events.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-39.F — Fallback shape per use case**
- *Pre-filled:*
  - `reverseFromImage` fallback → returns `{ prompt: "Describe a
    {{lane}}/{{platform}} hero image with subject + style + mood",
    notes: ["Grok offline — generic template"], fromFallback: true }`.
    No real image analysis without Grok; fallback is honest about
    being a stub.
  - `ideaToPrompt` fallback → routes to existing v1 prompt-composer
    based on lane: `ads.meta` → `ad-production` builder ·
    `ads.google-ads` → `ad-production` builder w/ google variant ·
    `aso.play` → `aso-screenshots` builder. Adds the user's idea as a
    `notes` line for the human to refine.
  - `textOverlayBrainstorm` fallback → fixed array of 5 templates
    keyed by tone label, with `{{headline}}` interpolation if
    provided.
- *Recommend:* ship these in B1; the wizard layer (B2) can polish
  the UX around the fallback notice.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-39.G — Vision input encoding**
- *Pre-filled:* convert `imageBuffer` → `data:image/{mime};base64,
  {b64}` inline at the call site. MIME sniff via the first 4 bytes
  (PNG `89 50 4E 47` · JPEG `FF D8 FF` · WEBP `52 49 46 46`). Default
  to `image/png` if unrecognised — xAI accepts the data URL form per
  their OpenAI-compat docs.
- *Alternative:* require callers to pass an explicit `mime` param.
  More boilerplate at every call site.
- *Recommend:* sniff inline. 6-line helper, no new dep.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-39.H — Test live-budget (real-API smoke)**
- *Pre-filled:* `tests/live/grok-live.test.ts` runs 3 real calls (one
  per use case) gated by `describe.skipIf(!process.env.XAI_API_KEY)`.
  Estimated cost ≤$0.005 / run (Grok pricing 2026: $0.20/M in,
  $0.50/M out; our smokes ≈300 in + 200 out tokens each = ~$0.0004
  per call). Add `npm run test:live:grok` script.
- *Recommend:* ship the live test file; bro runs it manually when
  a Grok-side API change is suspected.
- **STATUS: PRE-FILLED — bro confirm.**

**Q-39.I — Tokenizer for `input_tokens` log field**
- *Pre-filled:* the xAI response includes a `usage: { prompt_tokens,
  completion_tokens }` block (OpenAI-compat). Read directly from the
  response — no client-side tokenizer needed. Log only when the
  response carries usage; otherwise omit the field.
- **STATUS: LOCKED.**

**Q-39.J — UI surface in B1**
- *Pre-filled:* none. B1 is backend-only. No client hook, no Wizard
  page, no settings UI for the API key. B2 (S#40) lands the Prompt-
  Lab Wizard Step 3 buttons that *consume* these endpoints.
- *Verification path for B1:* curl + `data/logs/grok.jsonl`
  inspection. Same shape we use for keys-route smoke.
- **STATUS: LOCKED.**

**Q-39.K — Existing v1 prompt-composer reuse**
- *Pre-filled:* the fallback for `ideaToPrompt` imports
  `composeArtworkBatchPrompt` / `composeAdProductionPrompt` /
  `composeAsoPrompt` from `src/workflows/*/prompt-composer.ts`. These
  files exist (S#15-S#18) — confirm signatures haven't drifted at
  S#39 start before wiring.
- *Risk:* if any composer has changed its required-input shape,
  fallback breaks. Mitigation: tests cover each lane.
- **STATUS: OPEN — verify at S#39 start.**

---

## Estimate

- S#39 scope: **~1.5h** per PLAN-v3 §7.
- Pre-align Qs: ~5 min (bro skim Q-39.A/B/C/D/E/F/G/H + verify K).
- grok.ts + types + config + log: ~30 min.
- routes + body validation + mount: ~20 min.
- fallbacks + composer reuse: ~15 min.
- Tests (unit + integration): ~25 min.
- Live test + manual curl smoke: ~10 min (skip live if `XAI_API_KEY`
  not set on this box).
- Regression + commit: ~10 min.

---

## Working style (unchanged)

- Bro is bro. Bilingual VN/EN, concise replies.
- Pre-align Qs locked before firing code.
- <300 content LOC hard cap per file (250 soft).
- Pin exact versions. **No new runtime deps without asking** —
  expected new deps: zero (`fetch` + `AbortController` are platform
  built-ins).
- Show evidence before claiming done (HANDOFF rule #7) — for B1
  that means: regression green + curl call returning a real Grok
  response (or fallback if `XAI_API_KEY` unset) + grep
  `data/logs/grok.jsonl` to show the JSONL line shape.
- Node: `fnm exec --using=20 bash -lc "…"`.
- Preview MCP: B1 is backend-only, no preview need.

---

## Carry-forward (defer unless B1 runs short)

1. ReplayedFromChip nested-button a11y warning (2-line fix).
2. Sharp-derived icon-only favicon crop.
3. jm-* semantic class migration (gated).
4. `asset_tags` JOIN migration.
5. PromptLab.tsx line 99 stale TopNav comment (cosmetic).
6. Split hooks.ts (256 LOC, 6 over soft cap).

## Out of scope (this session)

- Wizard Step 3 UI (B2 = S#40).
- Prompt-Lab UI rewrite (B2).
- Policy guard layer (C1-C3 = S#41-43).
- Any Meta Ads / Google Ads / ASO wizard work (D/E/F sessions).
- Backend changes outside `src/server/services/grok*` and the
  3 new routes.

---

## Remaining sessions after S#39 (PLAN-v3 §7)

| # | Session | Phase                       | Est |
|---|---------|-----------------------------|-----|
| 4 | S#40    | **B2 Prompt-Lab UI**        | 2h  |
| 5 | S#41    | **C1 Policy schema**        | 1h  |
| 6 | S#42    | **C2 Scraper + ping**       | 2h  |
| 7 | S#43    | **C3 Enforcement + audit**  | 2h  |
| 8 | S#44    | **D1 Meta Ads backend**     | 2h  |
| 9 | S#45    | **D2 Meta Ads frontend**    | 2.5h|
|10 | S#46    | **E Google Ads lane**       | 2h  |
|11 | S#47    | **F1 Play ASO backend**     | 2h  |
|12 | S#48    | **F2 Play ASO frontend**    | 2h  |

**Total remaining after B1:** ~17.5h across 9 sessions. PLAN-v3
closes after S#48 + 1 week of bro dogfooding.

---

*Session #38 closed 2026-04-25 with A2 frontend shipped + pushed:
747/758 green, commit a97392e on origin/main. S#39 = Phase B1 Grok
adapter (backend-only) per PLAN-v3 §3 + §7. Pre-align Qs pre-filled
— bro skim + fire. Next: HANDOFF-SESSION40.md for B2 Prompt-Lab UI
drafted at S#39 close.*
