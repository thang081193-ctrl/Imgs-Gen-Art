# Session #33 Handoff — Post-ship support

Paste at the start of Session #33 to resume cleanly on any PC.

Session #32 closed Phase 6 (v1 ship polish). Phases 1-6 CLOSED. **Project is
v1 READY — feature-complete, polish-complete, ship-ready.**

**Session #33 = post-ship support.** No new feature work by default — the
next new-feature scope emerges from real dogfood findings, not from a
pre-baked roadmap. This handoff is a triage playbook + v2+ roadmap seed.

---

## Where we stopped (end of Session #32 — 2026-04-24)

- **Phase 6 CLOSED ✅** — F1 flake fix + F2 dead-code sweep + F3 Gallery
  custom date picker + F4 /api/tags endpoint & tag autocomplete combobox +
  F5 PromptLab standalone TopNav entry + F6 close-out docs.
- **Regression at S#32 close: 700 pass / 10 skipped / 1 todo / 711 total.**
  CF#27 flake resolved — 5/5 consecutive clean verified.
- **Git tree:** 5 Session #32 commits on top of `6c382f7`:
  - `6d907be fix(tests): F1 CF#27 flake — forks singleFork pool + rmSync retry budget`
  - `8a16968 refactor(api): F2 remove unused /profiles/:id/export + /profiles/import endpoints`
  - `cdb5327 feat(api): F4 GET /api/tags distinct tag autocomplete endpoint`
  - `8f987e8 feat(gallery,ui): F3 custom date picker + F4-FE tag autocomplete + F5 PromptLab entry`
  - (F6 docs commit — written as the final commit of S#32)
- On bro's home PC: `D:\Dev\Tools\Img Content Gen\Imgs-Gen-Art`.
  Node 20 via `fnm exec --using=20 bash -lc "…"`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -10    # expect 5 Session #32 commits on top of 6c382f7
npm install
npm run regression:full  # expect 700 pass / 711 total; should be CLEAN (no CF#27 flake)
```

## Phase status post-#32

| Phase | Scope | Status |
|---|---|---|
| 1 | Core runtime boundary + Hono + SQLite + asset store | ✅ v2.x |
| 2 | Template extraction + determinism | ✅ |
| 3 | Key mgmt + profiles + CRUD + watermark + workflows + SSE | ✅ |
| 4 | Provider adapters (Gemini + Vertex) + cost + compatibility + live smoke | ✅ |
| 5 | Replay + Gallery filters + Profile CMS + PromptLab + v2 schema | ✅ S#25-31 |
| 6 | v1 ship polish — drain backlog + release close-out | ✅ S#32 |
| **v1** | **feature-complete, polish-complete, ship-ready** | **READY** |

## Session #33 operating mode: post-ship support

**Do NOT ship new features in Session #33 by default.** The temptation
post-v1 is to chase every "nice to have" from the v2+ roadmap. Resist.
The next sized feature should be triggered by a real dogfood signal,
not by the assistant's or bro's speculation about what might be useful.

### What IS in scope for Session #33

1. **Bug fixes** — real user/dogfood issue reports. Flow below.
2. **Regression investigations** — if a CI-adjacent run surfaces a new
   flake or slow-down, isolate + fix.
3. **Doc corrections** — if PHASE-STATUS / DECISIONS / CONTRIBUTING have
   stale references (e.g., code moved, renamed, removed), fix the doc.
4. **Small ergonomic tweaks** — copy polish, typo fix, minor a11y fix
   a real user flagged. Must be < 30min or a proper scoped session.

### What is NOT in scope (don't start without bro's explicit go)

- Implementing any v2+ roadmap item below.
- Refactoring for "cleanliness" without a concrete correctness signal.
- Upgrading dependencies beyond what a vulnerability advisory mandates.
- Wiring jsdom + component tests (carry-forward #5) — hold until there's
  a recurring bug class that only a component test would catch.

## Bug-fix flow for Session #33

For any reported issue — user, dogfood, or self-observed:

1. **Reproduce locally first.** Capture the exact URL, inputs, steps.
   If you can't reproduce, go back to the reporter before writing code.
2. **Isolate the failing layer.** Is it schema? SQL? Route? Client?
   `git log --oneline -30` + `git blame` on the hot-path files first.
3. **Write a failing test** before the fix. Regression should go red
   with the bug, green with the fix. If the bug is UI-layer only,
   Preview MCP smoke replaces the regression test (carry-forward #5).
4. **Minimum-diff fix.** Don't opportunistically refactor around the
   bug — scope creep is the enemy of shipping fixes fast.
5. **`npm run regression:full` + Preview MCP smoke** if UI-touching.
   For race / flake suspicions, 5-run verification.
6. **Commit message format:** `fix(<scope>): <short description>` +
   body explains: what broke, root cause, fix, test coverage added.
   Link the source issue or reporter + date.
7. **Show evidence before claiming done.** Per existing HANDOFF rule.

## v2+ Roadmap Seed

These are the items explicitly deferred from Phase 6 + earlier phases.
All are **trigger-gated** — ship when a real signal fires, not when we
feel the itch.

| # | Item | Trigger |
|---|---|---|
| §C1 | `asset_tags` JOIN table migration | (a) asset count > 10k + LIKE-scan tag-filter latency observed, OR (b) real per-tag metadata surface (color / description / createdAt). Would enable rich tag page, merge-rename semantics, tag CRUD. |
| §G.1 | Server-side async flush await | Production asset-store write flow should `await fs.fsync` or stream-close before HTTP response. Trigger: any real production report of "deleted a batch, files reappeared" or similar race. |
| #1 | Live HTTP capability test | Live key committed to CI (unlikely v1-era). 11-pair smoke stays the coverage floor. |
| #5 | Component + hook tests via jsdom | Recurring UI regression that unit+integration+Preview-MCP don't catch. |
| #6 | `RATE_LIMIT` error code | Real provider returns rate-limit error observed. |
| #10 | Tree view via `parentHistoryId` | Linear list hits UX ceiling (>20 history entries for same asset). |
| #11 | Side-by-side diff panel | Inline word-diff fails on a real edit case reported. |
| #14 | Cursor-based pagination | Offset pagination breaks past ~10k assets (slow + inconsistent when inserts happen mid-scroll). |
| #15 | `asset_tags` JOIN table | See §C1. |
| #17 | Gallery DOM mount test | URL round-trip contract breaks in a real deploy. |
| #21 | Profile import UI | A real user needs to move a profile between machines and export-by-disk-copy isn't enough. Redesign import fresh — don't resurrect the deleted `/api/profiles/import` endpoint as-is; the UI requirements will dictate the shape. |
| #22 | 3-way merge UI | Preserve-edits-on-409 fails for a real concurrent-edit case. |
| #23 | Bulk profile operations | Profile count > 10 in dogfood. |
| #24 | Profile list search/filter | Profile count > 15 in dogfood. |
| #25 | Read-only profile view route | A real user asks for a stable shareable URL (vs export). |

### How to move something off this list

Any item above can be promoted when bro approves a specific concrete
trigger. The next session that promotes an item should:
1. Write a pre-code design doc (Qs + verdicts) like Phase 6's Q-32.A–F.
2. Confirm the trigger is real (user quote / dogfood log / metric).
3. Scope to one session if possible; if multi-session, split by layer.

## Dogfood findings — TEMPLATE (bro fills after post-ship use)

When you find an issue during real use, drop it here in this format:

```
### YYYY-MM-DD — <short title>
- Steps: <exact sequence>
- Expected: <what should happen>
- Actual: <what happened>
- Browser / Node version:
- Severity: blocker | major | minor | polish
- Related session: <optional link to past session that touched this area>
```

Example:
```
### 2026-04-25 — Gallery date chip overlaps batch ID chip on narrow window
- Steps: Gallery with `?dateFrom=2026-04-20&dateTo=2026-04-24&batchId=batch_xyz1234abc` at 1280px width.
- Expected: Chips wrap cleanly.
- Actual: Batch chip text overlaps date chip body.
- Browser: Chrome 131 / Node 20.
- Severity: polish
- Related: S#29 Q-29.A chip layout, S#32 F3 chip format.
```

(delete this placeholder once the first real finding lands.)

## Working style (unchanged)

- Bro is **bro**. Bilingual VN/EN, concise replies.
- Don't code until bro confirms alignment on scope Qs.
- <300 content LOC hard cap (250 soft, 300 fail). Plan file splits up-front.
- Pin exact versions (no `^`). No new deps without asking.
- `test:live:smoke-all` = billable — confirm budget with bro.
- Show evidence before claiming done (HANDOFF rule #7).
- Preview MCP smoke required for any UI surface change. Pattern locked
  in Session #31, extended through Session #32.

## Session #33 estimate

Not estimable in advance — depends entirely on what dogfood surfaces.
Expected envelope for a typical bug fix: 1-2h including repro, test,
fix, verify, commit, push. Plan a 2h max for the first post-ship
session so bro can assess v1 stability without burning a full dev day.

---

*Session #32 closed 2026-04-24. Phase 6 CLOSED. v1 READY.*
*Next: Session #33 = post-ship support (bug-fix flow + v2+ roadmap
seed defined above). Handoff file = `HANDOFF-SESSION33.md` (this file).*
