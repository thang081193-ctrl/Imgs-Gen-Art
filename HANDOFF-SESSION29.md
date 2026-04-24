# Session #29 Handoff — Phase 5 Step 3b (Gallery filter UI)

Paste at the start of Session #29 to resume cleanly on any PC.

Session #28 split at bro's pre-alignment into **28a** (backend schema +
query builder) and **28b** (frontend UI + URL sync). Same pattern as the
27a / 27b split on Step 5. Session #28a shipped; **Session #29 = 28b**.

---

## Where we stopped (end of Session #28a — 2026-04-24)

- **Phase 5 Step 3a CLOSED ✅** — `AssetListFilterSchema` (strict, CSV
  preprocess, legacy singular → plural merge) + `buildAssetListQuery`
  pure SQL builder. Backend-only ship — the Gallery UI still renders the
  pre-28a filter bar (profile / workflow / batchId), but the route now
  accepts every Session #29 dimension on the wire and `assetRepo.list()`
  delegates to the builder.
- **DECISIONS §C1 held** — tag filter is LIKE-scan on the JSON `tags`
  column. No `asset_tags` JOIN table. Post-v1 when dogfood pressure
  surfaces.
- **Backward-compat** — legacy singular `?profileId=X&workflowId=Y` still
  parses and merges into the plural filter. Existing Gallery calls +
  integration tests untouched.
- **Regression: 612 / 623** (10 skipped + 1 todo). +39 net vs
  Session #27b.
- **Git tree:** clean + 2 Session #28a commits on top of 27b's 41616cc.

On bro's home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`. Node 20
via `fnm exec --using=20 bash -lc "…"`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -4    # expect 2 Session #28a commits on top of 27b's 41616cc

npm install
npm run regression:full # expect pass count close to Session #28a close
```

Full regression occasionally surfaces the same pre-existing flake
(`ENOTEMPTY` rmdir race on `data/assets/chartlens/2026-04-24` across
parallel integration workers). Re-run; isolated runs always pass.

## What still needs doing on Phase 5

| Step | Title | Status |
|---|---|---|
| 3a | Filter schema + SQL builder backend | ✅ Session #28a |
| 3b | Filter UI + chips + empty state + URL sync | **Session #29 scope** |
| 4 | Profile CMS (CRUD UI + optimistic concurrency) | pending |
| 6 | AppProfileSchema v2 trigger-driven migration | pending (defer unless blocked) |

## Session #29 scope (frontend Step 3b)

Locked in Session #28 pre-alignment. All the verdicts in
`HANDOFF-SESSION28.md` Option B + bro's Q-3 answers + the 3 clarifications
(tags LIKE, path mapping, skip totalCount) still apply.

### Files to touch

Frontend only — NO backend changes. If you find yourself editing
`src/server/**` or `src/core/schemas/**`, stop + re-align.

**NEW:**
- `src/client/components/AssetFilterChips.tsx` — active-only chips, click
  body → scroll + flash-highlight + focus first input in the matching
  card section, click X → clear that dimension, "Clear all" button when
  ≥ 2 chips (right-aligned). Multi-value truncation: 3 + "+N more".
- `src/client/components/GalleryEmptyState.tsx` — renders when filtered
  result count === 0. Shows active filter summary + "Clear all filters"
  button. No "Try loosening one" in v1 (N+1 queries deferred).
- `src/client/utils/date-presets.ts` — `datePresetToRange(preset)` →
  `{ after: string }` | `null`. `today` = midnight local TZ ISO; `7d` /
  `30d` = rolling windows; `all` → null. ~30 LOC including tests mirror.

**MODIFY:**
- `src/client/components/AssetFilterBar.tsx` — grow from 147 LOC to
  multi-section layout. Preserve existing card (grid-cols-3) + add below:
  tags section (multi-select input + OR/AND radio), date preset section
  (4 radios: all / today / 7d / 30d), provider multi-select, model
  multi-select (cascade clears on provider change with toast), replayClass
  3-checkbox group. Each section: `id="filter-{dimension}"` anchor +
  `tabIndex={-1}` so scroll-focus works. **Watch the 250 soft / 300 hard
  LOC cap** — split per-section subcomponents into their own files if
  needed (`FilterBarTagsSection.tsx`, `FilterBarDateSection.tsx`, …).
- `src/client/api/hooks.ts` — expand `AssetsFilter` interface + rebuild
  `useAssets` query string builder. CSV-encode array params.
- `src/client/pages/Gallery.tsx` — URL state sync. Decode `window.location
  .search` on mount → `AssetListFilter`, encode filter → `history
  .replaceState` on change. Keep batchId deep-link from navigator
  working. Wire `<AssetFilterChips>` below the existing `<AssetFilterBar>`.
  Swap `<EmptyGallery>` for `<GalleryEmptyState>` when filters are active.

### Tests to add

- `tests/unit/date-presets.test.ts` — preset → range, `today` midnight
  local, rolling window bounds.
- `tests/unit/asset-filter-chips.test.tsx` (if jsdom lands; else defer to
  26-CF#1 bundle) — active-only render, click body scroll fires, X clear,
  Clear-all when ≥ 2.
- Integration smoke: `tests/integration/gallery-filter-url.test.ts` —
  push URL state, assert useAssets fetch query mirrors.

### Pre-alignment Qs for Session #29 kickoff

Bro may want to re-verify these at Session #29 start:

- **Q-29.A** Chips order: does the chips row follow the visual order of
  the card sections (profile → workflow → tags → date → provider → model
  → replayClass → batch), or insertion order (most-recently-changed
  first)? Recommend **card-section order** — stable, predictable.
- **Q-29.B** Multi-select input for tags — free-text with chip-on-Enter,
  or dropdown from "all tags seen across assets"? Recommend
  **free-text-with-Enter** v1; tag autocomplete needs a `/api/assets/tags`
  distinct endpoint we haven't built (Session #30+ polish).
- **Q-29.C** URL state encoding: raw CSV (`?tags=sunset,neon`) or
  base64(JSON)? Recommend **raw CSV** — readable in browser address bar,
  matches the backend wire contract, no client/server encoding drift.
- **Q-29.D** Provider multi-select: if bro picks both `gemini` and
  `vertex` and then a model that only exists on `gemini`, model filter
  narrows correctly (query side). UI cascade direction = model clears on
  provider change, but what if bro picks model THEN changes provider?
  Recommend **model clears regardless of direction**, toast once per
  transition.
- **Q-29.E** `replayClass` default "all on" — at render time chips row
  shows nothing when all 3 are selected (matches "≡ undefined"). But
  when bro unchecks 2 of 3, the chip shows the REMAINING class (the one
  that *is* selected), or the *excluded* classes? Recommend **show
  selected** — matches multi-select chip convention elsewhere.

Estimated: **5–7 hours** assuming Qs align in <30 min and bro is OK with
component tests deferred (26-CF#1 still needs jsdom peer-install).

## Carry-forwards (status at end of Session #28a)

| # | Source | Item | Status |
|---|---|---|---|
| 1 | 27a-CF#1 | HTTP capability test (needs live key) | still deferred |
| 5 | 26-CF#1 | Component + hook tests (needs jsdom) | still deferred |
| 6 | 26-CF#2 | `RATE_LIMIT` error code | still deferred |
| 7 | 26-CF#4 | Visual UI smoke Step 2 | bro self-smoke at office |
| 8 | 27b-new | `replay-service.ts` 257 LOC | still over soft cap; split if extended |
| 9 | 27b-new | Visual UI smoke Step 5b | bro self-smoke at office |
| 10 | 27b-new | Tree view via parentHistoryId | polish backlog |
| 11 | 27b-new | Side-by-side diff panel | polish backlog |
| 12 | 27b-new | PromptLab standalone entry | Phase 6 polish |
| 13 | 28a-new | Phase 5 Step 3b (Gallery filter UI) | **Session #29 scope** |
| 14 | 28a-new | Cursor-based pagination migration | Session #30+ |
| 15 | 28a-new | Tag `asset_tags` JOIN table (DECISIONS §C1) | post-v1 dogfood trigger |
| 16 | 28a-new | Custom date picker | polish backlog (dogfood trigger) |

## v2 schema trigger watch (no action needed)

Session #28a didn't touch `AppProfileSchema`. Step 3b is frontend-only —
also no schema surface. v2 trigger list unchanged from Session #27b:

- New required field on AppProfile
- Removal of a field clients depend on
- Semantic change to `visual.*` color fields (outside hex)

## Working style (unchanged)

- Bro is **bro**. Bilingual VN/EN, concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN section when creating files.
- <300 content LOC hard cap (250 soft, 300 fail). Plan file splits up-front.
- Pin exact versions (no `^`). No new deps without asking.
- `test:live:smoke-all` = billable — confirm budget with bro before firing.
- Show evidence before claiming done (HANDOFF rule #7).

## Session #29 estimate

- **Step 3b full ship** (recommended): 5–7 hours assuming Qs align.
- **Step 3b partial + Step 4 CMS kickoff**: ~10 hours. Unlikely to land
  CMS in one session; better to close 3b cleanly + queue 4 for #30.

Bro picks at Session #29 kickoff.

---

*Session #28a closed 2026-04-24 — Phase 5 Step 3a CLOSED (backend).
Next: Step 3b (frontend Gallery filter UI). Handoff file =
`HANDOFF-SESSION29.md` (this file).*
