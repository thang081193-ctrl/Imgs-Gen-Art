# Session #36 Handoff — PLAN-v3 design doc (v2 roadmap promotion)

Paste at the start of Session #36 to resume cleanly on any PC.

Session #35 closed the dogfood bug-fix mode with 3 commits (F1 cascade
delete + F2 concept-generator locale lock + F3 Vertex 429 retry-backoff).
Regression 713/724 clean throughout. During the same dogfood, bro
surfaced a v2 roadmap: the app is graduating from "4-workflow gen tool"
into a **2-lane creative studio** for Ads and ASO with platform-specific
policy guards, forward-compat for video gen, and LLM-assisted prompt
authoring. S#36 is a **PLAN-only session** — no code beyond the doc.

---

## Where we stopped (end of Session #35 — 2026-04-24)

- Phases 1-6 + S#35 bug-fix trio CLOSED. v1 feature-complete.
- Regression **713 pass / 10 skipped / 1 todo / 724 total**. Clean.
- LOC: 2 files above soft cap (Gallery 268, replay-service 257);
  0 above hard cap 300. AssetDetailModal now 225.
- **Git tree:** 3 Session #35 commits (d9b5b41 F3 · 15b9c65 F2 ·
  9bd4838 F1) on top of `598b2bd` (S#34 handoff docs).
- Preview MCP still blocked on this Windows box by the Node 20 / 24 ABI
  split; CLI regression + manual dev server via `fnm exec --using=20
  bash -lc "npm run dev"` both work. Details in the memory note
  `preview_mcp_node_env.md`.

## Current repo state (clone or pull, then verify)

```bash
cd /path/to/Imgs-Gen-Art
git pull origin main
git log --oneline -6       # expect d9b5b41, 15b9c65, 9bd4838 on top
npm install
fnm exec --using=20 bash -lc "npm run regression:full"
# expect 713 pass / 724 total
```

Manual dev server smoke (Preview MCP still blocked on Windows):

```bash
fnm exec --using=20 bash -lc "npm run dev"
# open http://localhost:5173, verify:
#   1. Ad Production · Restore · language=en · concepts=4 → 4 assets, all en
#   2. Delete an asset with replay descendants → amber warning + 204 cascade
```

---

## Priority pick — S#36 F1: PLAN-v3 design doc

Not a feature, not a bug fix. A **planning deliverable** that rewires
the app around bro's v2 ask. The code phases land in S#37+ sessions,
one lane/module per session per the split-backend/frontend rule.

### Scope chốt in Session #35 pre-align

| Q | Decision |
|---|---|
| Q-1 Platforms | Meta · Google Ads · Google Play ASO (all 3, phased) |
| Q-2 LLM provider | Grok (xAI API) — cheaper + larger context + bro has key |
| Q-3 Policy guards | Strict block · rules researched from Meta/Google docs · user override layer |
| Q-4 ASO platforms | Google Play only in v2; App Store defers to v3+ |
| Q-5 Header ref | JM Studio Meta/TikTok Converter look — giant logo, 2-line title, version strip, nav pills with icon |
| Q-6 v1 workflow fate | **Artwork · Ad · Style kept as Saved Styles** (presets). ASO Screenshots retired — subsumed by v2 ASO lane. |
| Q-7 Delivery | Phased, rules cũ: clean/lean/module/QA/regression |
| Q-10a Home CTAs | **2 primary CTAs: Ads Images / ASO**. Ads Images fans into Meta / Google sub-nav. |
| Q-10b Home section | "Your Saved Styles" — lists 3 legacy presets + user-created ones |
| Q-10c Data | Do NOT wipe gallery or assets; backward-compat preserved |

### PLAN-v3 doc deliverable

Target file: `PLAN-v3.md` in repo root. ~400-500 LOC markdown, no code.

Proposed structure (finalize in S#36; this is the skeleton to fill):

```
§0  Context + goals (graduation from v1 to v2 Ads+ASO studio)
§1  Information architecture
    §1.1 Home — 2 lane CTAs + Saved Styles section
    §1.2 Creative Project wizard (lane → platform → input mode → gen)
    §1.3 Gallery (keep, add lane filter)
    §1.4 Saved Styles (new entity, migration from 3 workflows)
§2  Creative Project flow (per step, data shape, UX)
§3  Grok LLM prompt-suggester adapter
    §3.1 API shape, model choice, cost model
    §3.2 3 use-cases: reverse-from-image · idea-to-prompt · text-overlay-brainstorm
    §3.3 Fallback when Grok unavailable
§4  Platform policy guard layer
    §4.1 Rule schema (per platform × format)
    §4.2 Initial rule set (Meta Ads, Google Ads, Play ASO) — doc links
    §4.3 User-override mechanism (v2+ or co-ship?)
§5  Header + homepage redesign
    §5.1 Logo/mark sizing, 2-line title, version strip layout
    §5.2 Nav pills with icons (Profiles, Specs, Gallery, Settings)
    §5.3 Status "Sẵn sàng" pill (tie to /api/health polling)
    §5.4 Forward-compat slot for video gen (v3+)
§6  Saved-Style data model + migration
    §6.1 New `saved_styles` table schema
    §6.2 3 legacy workflow → 3 preset rows (one-time migration)
    §6.3 ASO Screenshots retirement plan
§7  Phase delivery plan
    Phase A: IA + header + Saved Styles (UI-only, backend untouched)
    Phase B: Grok adapter + prompt-suggester service
    Phase C: Policy guard layer + rule library
    Phase D: Ads lane — Meta first (end-to-end E2E smoke)
    Phase E: Ads lane — Google Ads
    Phase F: ASO lane — Google Play
    Each phase: backend + frontend split sessions (per feedback rule).
§8  Out-of-scope (video gen · App Store · team collab · multi-user auth)
§9  DECISIONS §J log (all Q answers from S#35 pre-align locked here)
```

### Decision Qs for S#36 start (most locked end of S#35)

- **Q-36.A** — PLAN-v3.md sits side-by-side with PLAN-v2.2.1.md.
  v2.2.1 stays as historical v1 blueprint (all 14 DoD items shipped in
  practice though the checklist was never ticked in-doc). PLAN-v3 is
  the forward-looking doc for v2 lanes. No migration of v2.2.1 content.
  **Status: LOCKED.**
- **Q-36.B** — Grok model pick: defer. Bro will confirm model IDs +
  API-key flow at S#36 start. Draft PLAN-v3 §3 with a `grok-TBD`
  placeholder + contract-level description that's model-agnostic.
  **Status: OPEN — confirm at S#36 start.**
- **Q-36.C** — Policy guard rules: **auto-scraped** from Meta/Google docs
  as the base layer, plus a user-additions override layer. PLAN-v3 §4
  specifies the scraper pipeline (cron? per-boot? manual?), the
  override precedence (user > scraped > default), and the audit trail
  (which rule blocked which gen). **Status: LOCKED.**
- **Q-36.D** — Saved Styles migration: **ships in Phase A alongside the
  IA/header rework** — not a separate pre-Phase step. One-time boot
  migration drops legacy ASO Screenshots and promotes Artwork + Ad +
  Style to `saved_styles` rows. **Status: LOCKED.**
- **Q-36.E** — Header redesign: **Phase A from day one**, matching the
  JM Studio Meta/TikTok Converter reference (giant logo + 2-line title
  + version strip + nav pills with icons + status pill). No separate
  UI-polish sub-phase. **Status: LOCKED.**

Open: Q-36.B only. Everything else is decided before S#36 opens.

### Estimate

- S#36 scope: read + draft PLAN-v3 skeleton + fire 5 Qs + fill answers +
  finalize doc. ~2h.
- Follow-up S#37+: Phase A (UI) → backend sessions per phase.

---

## Other carry-forward (lower priority, pull only if S#36 runs short)

- Pre-existing nested-button warning in ReplayedFromChip (`<button>`
  inside `<button>`). Minor a11y issue. Could land pre-PLAN-v3 as a
  2-line fix if the day is slow.
- Sharp-derived icon-only favicon crop (from HANDOFF-SESSION33 carry-over).
- jm-* semantic class migration.
- §C1 asset_tags JOIN migration.

## Out of scope (v3+ carry-forward)

- Tree view via parentHistoryId.
- Side-by-side diff panel.
- Cursor-based pagination.
- Profile import UI.
- 3-way merge UI.
- Bulk profile operations.
- Profile list search/filter.
- Read-only profile view route.
- Bulk delete cross-page selection.
- Video generation (entire lane, v3+).
- App Store ASO (v3+).

## Working style (unchanged)

- Bro is **bro**. Bilingual VN/EN, concise replies.
- Pre-alignment Qs before firing code (§Q-36.* above for S#36).
- <300 content LOC hard cap (250 soft, 300 fail).
- Pin exact versions. No new deps without asking.
- `test:live:smoke-all` = billable — confirm budget before firing.
- Show evidence before claiming done (HANDOFF rule #7).
- Preview MCP smoke still blocked on this Windows host (ABI split);
  manual `fnm exec --using=20 bash -lc "npm run dev"` works.

---

*Session #35 closed 2026-04-24 (3 bug-fix commits: cascade delete,
locale lock, 429 retry-backoff). Regression 713/724 CLEAN. Next:
Session #36 = PLAN-v3 design doc for the v2 Ads + ASO studio pivot.
Handoff file = `HANDOFF-SESSION36.md` (this file). Post-S#36, phase
delivery sessions S#37+.*
