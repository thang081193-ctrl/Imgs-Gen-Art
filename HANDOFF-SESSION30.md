# Session #30 Handoff — Phase 5 Step 4 (Profile CMS)

Paste at the start of Session #30 to resume cleanly on any PC.

Session #29 shipped Step 3b (Gallery filter UI + Q-29.E backend scope
delta). Session #30 = Step 4 (Profile CMS frontend CRUD). Backend
`/api/profiles` CRUD is already live since Phase 3 — Session #30 is
frontend-only unless a schema surface change is needed.

---

## Where we stopped (end of Session #29 — 2026-04-24)

- **Phase 5 Step 3b CLOSED ✅** — expanded Gallery filter UI: 8-
  dimension `AssetFilterBar` with anchor sections, specificity-order
  `AssetFilterChips`, `GalleryEmptyState`, full URL ↔ filter round-trip
  via `AssetListFilterSchema.safeParse` + `history.replaceState`.
  Tag free-text input (Enter/comma/Tab), provider → model cascade
  toast, `replayClasses === []` "match-none" wire semantics.
- **Backend scope delta (Q-29.E option b)** — `csvArrayPreserveEmpty`
  schema helper + `1 = 0` SQL clause so the UI 0-of-3 state round-
  trips. Applied only to `replayClasses`; other plural fields keep
  existing semantics. DECISIONS §D documents the pattern.
- **Regression: 641 / 10 skipped / 1 todo / 652 total.** +29 net vs
  Session #28a. Pre-existing `replay-route.test` ENOTEMPTY flake still
  occasionally surfaces in parallel runs; isolated passes 10/10.
- **Git tree:** clean + 3 Session #29 commits on top of #28a close
  (d706529).

On bro's home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`. Node 20
via `fnm exec --using=20 bash -lc "…"`.

## Dogfood window (before Session #30 kickoff)

Bro self-smokes 30–60min before firing #30:
- Exercise Gallery filters across real workflow assets (tags, date,
  replay, cascade).
- Click chip bodies to confirm scroll + flash + focus.
- Backspace-remove-tag, Clear-all, URL back/forward.
- PromptLab + Replay on a few assets to surface workflow pain.
- **Observations feed CMS scope priorities** (see Q-30 below).

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -5    # expect 3 Session #29 commits on top of d706529
npm install
npm run regression:full # expect 641 pass / 10 skipped / 1 todo
```

Same parallel-workers flake may surface on first run — retry or isolate
`tests/integration/replay-route.test.ts` to confirm.

## What still needs doing on Phase 5

| Step | Title | Status |
|---|---|---|
| 3b | Gallery filter UI | ✅ Session #29 |
| 4 | Profile CMS (CRUD UI + optimistic concurrency) | **Session #30 scope** |
| 6 | AppProfileSchema v2 trigger-driven migration | pending (defer unless blocked) |

## Session #30 scope (Phase 5 Step 4)

Backend is already live (`src/server/routes/profiles.ts` — GET / / :id /
:id/export, POST / / import, PUT /:id, DELETE /:id, all wired to
`profile-repo` with the existing `version` column for optimistic
concurrency). Session #30 is the frontend CMS on top.

### Files to touch

Frontend first. If `src/server/**` or `src/core/schemas/app-profile.ts`
edits appear, stop + re-align (same rule as Session #29).

**NEW (estimated):**
- `src/client/pages/Profiles.tsx` — list view (table: name / category /
  tone / market tier / last-modified) + "+ New profile" CTA + row
  actions (edit / duplicate / export / delete).
- `src/client/pages/ProfileEdit.tsx` — dedicated editor page for a
  single profile (create or edit mode). Tabbed / stacked sections
  mirroring `AppProfileSchema`: Identity, Visual, Positioning, Context,
  Brand Voice. Save button + "Cancel" with dirty-state prompt.
- `src/client/components/profile-editor/*` — per-section form
  components. Split aggressively — the schema has ~25 fields across
  5 groups; each section likely 80–120 LOC. Candidates:
  - `ProfileIdentitySection.tsx` (name, slug, category, marketTier)
  - `ProfileVisualSection.tsx` (colors × 3, tone, do/don't lists)
  - `ProfilePositioningSection.tsx` (USP, target persona, competitors
    list with add/remove chips)
  - `ProfileContextSection.tsx` (features / keyScenarios /
    forbiddenContent — similar multi-string list pattern)
  - `ProfileBrandVoiceSection.tsx` (whatever lives on the schema)
- `src/client/components/profile-editor/StringListEditor.tsx` —
  reusable chip-based multi-string input (competitors, do/don't,
  features, keyScenarios, forbiddenContent all share this shape). One
  component avoids per-field copy-paste.
- `src/client/api/profile-hooks.ts` — `useProfile` (already exists in
  `api/hooks.ts`) extended with `useProfileMutations` (create / update
  / delete / duplicate / export) that thread `version` through for
  optimistic concurrency. Probably cleanest as a new file; `api/hooks.ts`
  is at 267 LOC and growing.

**MODIFY:**
- `src/client/App.tsx` / `src/client/navigator.ts` — add `profiles`
  (list) + `profile-edit` (editor, `params: { id?: string }`) pages to
  the Page union.
- `src/client/components/TopNav.tsx` — add Profiles nav item.
- `src/client/pages/Settings.tsx` (if profiles currently referenced
  there) — replace with link to the new Profiles page.

### Optimistic concurrency

Backend returns `version: number` on every profile response; PUT
accepts `If-Match` or body-level `expectedVersion`. Session #30 wires
this through:
- Editor loads profile → stores `version` in local state.
- On Save, client sends `{ ...body, expectedVersion: version }`.
- 409 response → toast "Profile was modified by another tab. Reload
  to merge." + CTA that re-fetches the profile (discards local dirty
  state, or prompts "Keep your changes / Discard").
- v1 simple path: on 409, force-reload + toast; a proper 3-way merge
  is out of scope.

### Tests

- `tests/unit/profile-hooks.test.ts` (if lifted to its own file) —
  mutation wiring + optimistic-concurrency 409 handling. Pure logic
  tests only (jsdom still deferred).
- Integration smoke: `tests/integration/profiles-crud.test.ts` exists
  already — extend with a 409 version-conflict case if the current
  coverage doesn't hit it.
- Manual UI smoke (carry-forward pattern): create → edit → save →
  duplicate → export → delete flow in the browser.

### Pre-alignment Qs for Session #30 kickoff

- **Q-30.A** Single-page editor vs modal? Recommend **dedicated editor
  page** at `/profile/:id` (or navigator equivalent) — the schema has
  too many fields for a modal; breadcrumb + Save/Cancel keeps the
  commit-semantics obvious.
- **Q-30.B** List view columns? Recommend **name / category / tone /
  market tier / last-modified** + row actions. Add search-by-name if
  dogfood surfaces > 15 profiles; skip in v1.
- **Q-30.C** Duplicate semantics — does "Duplicate" clone the profile
  with `" (copy)"` appended to the name, or open the editor pre-filled
  without saving? Recommend **clone-and-save immediately** (server
  generates a new id + slug), then navigate to the new profile's
  editor. Matches the import flow.
- **Q-30.D** Export format? Backend already ships
  `GET /:id/export` → JSON. Recommend **download as `.profile.json`**
  from the row action; no UI changes.
- **Q-30.E** 409 conflict resolution UX? Recommend **simple reload +
  toast v1** (user loses in-flight dirty state with a confirm prompt).
  3-way merge = Phase 6 polish.
- **Q-30.F** Slug: auto-generate from name or user-editable? Backend
  enforces uniqueness. Recommend **auto-generate on create, lock after
  save** (changing slugs breaks external references). Editor shows the
  slug as read-only with a one-time "edit slug" affordance behind a
  warning.
- **Q-30.G** Do/don't + competitors + features + keyScenarios +
  forbiddenContent all fit a `StringListEditor` mold. Confirm one
  shared component or per-field variants? Recommend **one shared
  component** (`placeholder` + `maxItems` props parameterize per use).

Estimated: **6–8 hours** assuming Qs align in <30min.

## Carry-forwards (status at end of Session #29)

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
| 14 | 28a-new | Cursor-based pagination migration | Session #30+ |
| 15 | 28a-new | Tag `asset_tags` JOIN table (DECISIONS §C1) | post-v1 dogfood trigger |
| 16 | 28a-new | Custom date picker | polish backlog (dogfood trigger) |
| 17 | 29-new | Full Gallery DOM mount test (needs jsdom) | covered by URL round-trip unit until jsdom lands |
| 18 | 29-new | Visual UI smoke Step 3b (chip scroll + cascade toast + URL back/forward) | bro self-smoke during #29→#30 dogfood |
| 19 | 29-new | Tag autocomplete + `/api/assets/tags` distinct endpoint | polish backlog |

## v2 schema trigger watch (no action needed)

Session #29 didn't touch `AppProfileSchema`. Step 4 Profile CMS may
surface v2 triggers if the editor exposes a new required field or a
semantic shift; if so, pause + invoke DECISIONS §B trigger review. v2
trigger list unchanged from Session #27b:

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

## Session #30 estimate

- **Step 4 full ship** (recommended): 6–8 hours assuming Qs align and
  the StringListEditor shared-component bet holds.
- **Step 4 + Step 6 v2 migration kickoff**: ~12 hours. Only attempt if
  dogfood surfaces a v2 trigger during #29→#30; otherwise Step 4 alone.

Bro picks at Session #30 kickoff.

---

*Session #29 closed 2026-04-24 — Phase 5 Step 3b CLOSED (Gallery
filter UI + Q-29.E backend scope delta). Next: Step 4 (Profile CMS).
Handoff file = `HANDOFF-SESSION30.md` (this file).*
