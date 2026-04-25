# Session #38 Handoff — Phase A2 frontend (AppHeader + Home CTAs + Saved Styles shelf + ASO retire)

Paste at the start of S#38 to resume cleanly on any PC. Frontend-only
follow-up to S#37 A1 backend (PLAN-v3 §1 + §5 + §6.3). Approach B —
pre-align Qs pre-filled with best-guess answers; bro skim + correct +
fire.

---

## Where we stopped (end of Session #37 — 2026-04-25)

- **Phase A1 backend shipped.** 7 new files, 6 modified. Migration
  `2026-04-25-saved-styles.sql` + `saved_styles` table + REST CRUD +
  boot-time idempotent preset seeding (3 legacy presets) + `assets.lane`
  default 'legacy' + `batches.policy_decision_json` (Q-37.I locked
  batch-level).
- **Regression:** **725 pass / 10 skipped / 1 todo / 736 total** (vs
  S#36 baseline 713 / 724 → +12 cases from new smoke test).
- **Decisions locked this session:** Q-37.A (date filename) · Q-37.D
  (thin pointer-doc preset templates) · Q-37.H (§6.2 SQL spec) · Q-37.I
  (`policy_decision_json` on `batches` — per-batch audit) · Q-37.J
  (TEXT ISO timestamps for `saved_styles`, deviation from PLAN draft
  INTEGER). All in PLAN-v3 §J.
- **Git tree:** S#37 commit shipped. Run `git log --oneline -3` to
  confirm before firing A2.

## Current repo state (verify before firing A2)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -5    # expect S#37 A1 commit on top
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 725 / 736 (or 725 + new A2 tests after this session)
```

REST surface to call from the new client code:

- `GET  /api/saved-styles` — list (DTO `SavedStyleDto[]` under `styles`).
- `GET  /api/saved-styles?lane=ads` — prefix filter (matches `ads.meta`
  + `ads.google-ads`). Also accepts `?lane=ads.meta` exact, `?kind=user`.
- `GET  /api/saved-styles/:id` — detail.
- `POST /api/saved-styles` — body `{slug, name, description?, promptTemplate, previewAssetId?, lanes[]}`; `kind` server-forced to `user`.
- `PATCH /api/saved-styles/:id` — partial; **403 PRESET_LOCKED** on preset rows.
- `DELETE /api/saved-styles/:id` — **403 PRESET_LOCKED** on preset rows.

DTO shape (`src/core/dto/saved-style-dto.ts`): `previewAssetUrl` is
pre-resolved to `/api/assets/:id/file` — clients don't stitch URLs.

---

## Priority pick — S#38: Phase A2 frontend

### Goal

Land the lane-first IA from PLAN-v3 §1: redesigned AppHeader (JM Studio
vibe), Home with 2 giant lane CTAs + Saved Styles shelf, retire the
ASO-Screenshots route from the client (backend assets stay untouched).

### Deliverables

1. **AppHeader rewrite** — `src/client/components/AppHeader.tsx` (new or
   replaces existing TopNav.tsx). Per PLAN-v3 §5.1:
   - 48×48 logo (32×32 mobile) · 2-line title `Creative Studio` /
     `Ads Images · Google Play ASO`.
   - Right-aligned version strip: `v{pkg} · #{git short SHA} · last gen
     {rel time}`. Git SHA via Vite `define` (existing pattern? confirm
     at S#38 start).
   - Status pill polling `/api/health` every 30s — Sẵn sàng / Degraded /
     Lỗi tri-state.
2. **NavPillBar** — `src/client/components/NavPillBar.tsx`. Pills:
   `[Profiles] [Specs] [Gallery] [Settings]` with inline-SVG leading
   icons. Reserved Video slot rendered behind `VIDEO_LANE_ENABLED` flag
   (false in v2).
3. **StatusPill** — `src/client/components/StatusPill.tsx`. Extracted so
   the polling logic is testable in isolation.
4. **Home rewrite** — `src/client/pages/Home.tsx`:
   - 2 `LaneCtaCard` (new component, `src/client/home/LaneCtaCard.tsx`)
     for Ads Images + Google Play ASO. Click stub-routes to `/wizard?lane={ads|aso}` (placeholder route — wizard ships D1+).
   - `SavedStylesShelf` (new, `src/client/home/SavedStylesShelf.tsx`)
     fetches `GET /api/saved-styles`, renders preset + user cards, pill
     badge differentiating `preset-legacy` vs `user`. Click card → stub
     `/saved-styles/:id` route.
5. **ASO Screenshots client retirement** (PLAN-v3 §6.3):
   - Delete `src/client/workflows/aso-screenshots.tsx` + its registration
     in `src/client/workflows/index.ts` + nav links.
   - Backend assets untouched (per Q-10c). Existing rows remain
     `lane='legacy'`, browsable in Gallery.
6. **Tests:**
   - Component tests for `LaneCtaCard`, `SavedStylesShelf`, `StatusPill`.
   - Integration smoke for Home rendering both presets + 1 user style
     fixture. Use the existing test runner setup (vitest + jsdom — see
     `tests/unit/profile-list-helpers.test.ts` for pattern).
7. **Preview MCP verification** — A2 IS observable. Run preview, screenshot
   the new Home + AppHeader, share with bro. Note: Preview MCP still
   blocked on Windows host-env (Node 24 vs 20 mismatch — see
   `preview_mcp_node_env.md` memory). If still broken, document the
   block and ship dev-server screenshots manually via Bash.

### LOC budget

| File | Budget |
|------|--------|
| AppHeader.tsx                 | ~120 |
| NavPillBar.tsx                | ~70  |
| StatusPill.tsx                | ~80  |
| Home.tsx (rewrite)            | ~150 |
| LaneCtaCard.tsx               | ~80  |
| SavedStylesShelf.tsx          | ~140 |
| home-saved-styles.test.ts     | ~100 |
| status-pill.test.ts           | ~60  |
| **Total**                     | **~800 LOC across 8 files** |

All ≤ soft cap 250. SavedStylesShelf is the fattest — cap-watch at S#38
midpoint.

---

## Pre-align Qs (pre-filled, bro corrects)

**Q-38.A — Replace TopNav.tsx or coexist?**
- *Pre-filled:* **Replace.** PLAN-v3 §5 reserves the slot for the new
  AppHeader; coexisting two top bars is confusing. Migrate any unique
  TopNav features (route highlighting?) into NavPillBar.
- **STATUS: PRE-FILLED.**

**Q-38.B — Git short SHA injection**
- *Pre-filled:* Vite `define: { __GIT_SHA__: JSON.stringify(execSync('git rev-parse --short HEAD')) }`
  in `vite.config.ts`. Falls back to `'dev'` if not in a git tree.
- *Alternative:* read via runtime fetch from `/api/health` (server reads
  on boot). Adds a hop but works offline of git.
- *Recommend:* build-time define (cleaner, no runtime cost).
- **STATUS: PRE-FILLED — bro confirm.**

**Q-38.C — `last gen {rel time}` source**
- *Pre-filled:* Add `lastGenAt: string | null` to `/api/health` response
  (cheapest — health endpoint already polled every 30s by StatusPill).
  Server queries `MAX(created_at) FROM assets`.
- *Alternative:* dedicated `/api/health/last-gen` endpoint per PLAN-v3
  §5.1 footnote.
- *Recommend:* extend `/api/health` (1 query, no new route, piggybacks
  the 30s poll cadence).
- **STATUS: OPEN — pick at S#38 start.**

**Q-38.D — Saved Styles shelf empty state when only presets exist**
- *Pre-filled:* Render the 3 presets normally + small "No personal
  styles yet — sign up by clicking ⭐ on a generated asset" prompt below
  the shelf. The ⭐ flow ships in D1+; copy the placeholder now.
- *Alternative:* hide the prompt until presets stop being the only rows.
- **STATUS: PRE-FILLED.**

**Q-38.E — Click-card destination for `/saved-styles/:id`**
- *Pre-filled:* Stub route renders read-only detail card (preview, prompt
  template, lanes, usage count) + "Use in wizard" disabled button (live
  in D1+). Edit/delete buttons rendered only when `kind === 'user'`.
- *Alternative:* skip the route entirely in A2; add in D1.
- *Recommend:* ship the read-only stub now — minimal LOC, lets bro
  dogfood the shelf.
- **STATUS: OPEN — pick at S#38 start.**

**Q-38.F — VIDEO_LANE_ENABLED flag location**
- *Pre-filled:* Hard-coded `const VIDEO_LANE_ENABLED = false` in
  NavPillBar.tsx. No env var, no settings UI — flips to `true` in v3+.
- **STATUS: LOCKED.**

**Q-38.G — Preview MCP block contingency**
- If Preview MCP still broken on Windows: spin dev server via
  `fnm exec --using=20 bash -lc "npm run dev"`, take screenshots
  manually via Windows snipping or `nircmd savescreenshot`, paste
  into chat. Don't claim done without visual evidence.
- **STATUS: LOCKED.**

**Q-38.H — ASO retirement scope**
- *Pre-filled:* Client deletion only. Keep
  `data/templates/aso-screenshots.json` if exists, keep server route
  intact (stays for backward-compat replay of legacy ASO assets). New
  gens via this workflow stop because the entry point is gone.
- *Alternative:* also strip the server route (cleaner but breaks replay
  of legacy ASO assets — violates Q-10c "preserve gallery").
- *Recommend:* client-only deletion.
- **STATUS: PRE-FILLED.**

---

## Estimate

- S#38 scope: **~2.5h** per PLAN-v3 §7.
- Pre-align Qs: ~5 min (bro skim Q-38.C + E + B).
- AppHeader + Nav + Status: ~45 min.
- Home + LaneCtaCard + SavedStylesShelf: ~60 min.
- ASO retire + tests: ~30 min.
- Preview verification + screenshots + commit: ~15 min.

---

## Working style (unchanged)

- Bro is bro. Bilingual VN/EN, concise replies.
- Pre-align Qs locked before firing code.
- <300 content LOC hard cap per file (250 soft).
- Pin exact versions. No new deps without asking.
- Show evidence before claiming done (HANDOFF rule #7) — A2 is observable
  in browser, screenshots required.
- Node: `fnm exec --using=20 bash -lc "…"`.
- Preview MCP: try first, fall back to manual dev server + screenshots
  if still blocked on Windows.

---

## Carry-forward (defer unless A2 runs short)

1. ReplayedFromChip nested-button a11y warning (2-line fix).
2. Sharp-derived icon-only favicon crop.
3. jm-* semantic class migration (gated).
4. `asset_tags` JOIN migration.

## Out of scope (this session)

- Wizard UI (D1+ scope — A2 stubs to `/wizard?lane=...`).
- Grok adapter (B1 session).
- Policy scraper / banner (C1-C3).
- Backend changes (saved_styles repo + endpoints already shipped in
  S#37 — A2 only consumes them).

---

*Session #37 closed 2026-04-25 with A1 backend shipped: 725/736 green.
S#38 = Phase A2 frontend (AppHeader + Home + Saved Styles shelf + ASO
retire) per PLAN-v3 §7. Pre-align Qs pre-filled — bro skim + fire.
Next: HANDOFF-SESSION39.md for B1 Grok backend drafted at S#38 close.*
