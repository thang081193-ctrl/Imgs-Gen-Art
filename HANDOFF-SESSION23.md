# Session #23 Handoff — Phase 4 Step 7 (11 live smoke tests)

Paste this at the start of Session #23 to resume cleanly.

---

## Where we stopped (end of Session #22)

- **Phase 4 Step 6 ✅ DONE** — compatibility warning banner shipped, 497/497 regression green, 2 clean commits on `main`.
- Latest commits:
  - `8d11555` docs: Phase 4 Step 6 close — PHASE-STATUS Session #22
  - `b172d55` feat: Phase 4 Step 6 — compatibility warning banner on workflow page
  - `c70c09f` docs: Session #22 handoff — Phase 4 Step 6 kickoff notes
- Git tree clean; **15 commits ahead of `origin/main`** (unpushed — bro chose to wait until Phase 4 close).
- Working directory: `D:\Dev\Tools\Images Gen Art`.
- Phase 4 status: 6 of 8 steps done. Remaining: Step 7 (this session — live smokes), Step 8 (close).

> ⚠️ **Session numbering note:** `BOOTSTRAP-PHASE4.md` lists Step 7 as "Session #24" and Step 8 as "Session #25". That's stale — Session #21 bundled Steps 4+5, so actual mapping is **Step 7 = Session #23, Step 8 = Session #24**. `PHASE-STATUS.md` reflects the correct numbering. Fix BOOTSTRAP in Step 8.

## Source-of-truth read order (Session #23 kickoff)

1. **`PHASE-STATUS.md`** — Session #22 entry (top of file). Compat banner shipped; positive/negative split between `CompatBadge` (green only) and `CompatibilityWarning` (red).
2. **`BOOTSTRAP-PHASE4.md` Step 7** — lines 174-194. 11-pair matrix + deliverables.
3. **`PLAN-v2.2.1.md` §7.4** — Compatibility Matrix table. Imagen 4 fails style-transform (no `supportsImageEditing`).
4. **`tests/live/providers.gemini-live.test.ts`** + **`providers.vertex-live.test.ts`** — existing gated-live pattern (`describe.skipIf(!HAS_KEY)`, 15s/45s timeouts, minimal prompts). Copy the gate pattern.
5. **`MEMORY.md`** — global project rules + phase status snapshot.

## Baseline verify BEFORE code (Session #23 opening)

```bash
npm run lint                  # expect clean
npm run typecheck             # expect 0 errors
npm run regression:full       # expect 497/497 green (46 files)
git status                    # expect clean
git log -1 --oneline          # expect 8d11555 docs: Phase 4 Step 6 close
```

If any fails → fix before Step 7 work.

## Session #23 target — Phase 4 Step 7 (11 live smoke tests)

**Goal:** Every compatible (workflow, provider:model) triple has a gated live smoke that runs a 1-concept / 1-variant batch end-to-end and asserts the written asset file exists + has real PNG bytes. Catches SDK-version bump regressions.

**Matrix (11 pairs per PLAN §7.4):**

| Workflow          | NB Pro | NB 2 | Imagen 4 |
|-------------------|--------|------|----------|
| artwork-batch     | ✅      | ✅    | ✅        |
| ad-production     | ✅      | ✅    | ✅        |
| style-transform   | ✅      | ✅    | ❌ (no `supportsImageEditing`) |
| aso-screenshots   | ✅      | ✅    | ✅        |

Total = 4 + 4 + 3 = **11**.

**Files dự kiến:**

- `tests/live/workflows-smoke.test.ts` (NEW) — 11 parameterized tests. Each:
  1. Builds the workflow input with `numConcepts: 1` + `numVariants: 1` (or equivalent smallest-valid shape per workflow).
  2. POSTs to `/api/workflows/:id/run` against a real in-process server (`createApp()` pattern from existing integration tests; set `apiKey` via `HealthCheckContext` passthrough OR init slot-manager with real key).
  3. Reads SSE frames until `complete` or `error`.
  4. Asserts: batch status === `"completed"`, `successfulAssets === 1`, file at `data/assets/{profileId}/{YYYY-MM-DD}/{assetId}.png` exists + size > 1KB.
  5. Timeout 90s per test (real SDK latency ~15-45s + buffer).
- `package.json` — add script `"test:live:smoke-11": "vitest run tests/live/workflows-smoke.test.ts"` (NOT `test:live` — that would include the adapter-level smokes; keep this one targeted).

**Gating:**

- `describe.skipIf(!HAS_GEMINI && !HAS_VERTEX)("...")` — block skips entirely if neither key present.
- Per-test `.skipIf(!HAS_<provider>)` — Gemini-only tests skip without `GEMINI_API_KEY`; Vertex-only tests skip without `VERTEX_PROJECT_ID` + `VERTEX_SA_PATH`.
- **Never** run in CI / `regression:full` — Vitest config already excludes `tests/live/**`.

**Env required:**

```bash
export GEMINI_API_KEY="AIza..."
export VERTEX_PROJECT_ID="your-project"
export VERTEX_SA_PATH="/absolute/path/to/service-account.json"
```

Or set them in a local `.env` that Vitest loads (check `vitest.config.ts` — currently no dotenv load, but `process.env` works from parent shell).

**Budget:** 11 × ~$0.10 avg = ~**$1.10 per full run**. Breakdown:
- NB Pro × 4 workflows = 4 × $0.134 = $0.536
- NB 2 × 4 workflows = 4 × $0.067 = $0.268
- Imagen 4 × 3 workflows = 3 × $0.04 = $0.12
- Total ≈ $0.92 (call it $1.10 with buffer).

**QA gate:** bro runs `npm run test:live:smoke-11` with keys set; all 11 green.

## 5 scope Qs for bro BEFORE coding Session #23

**Q1 — End-to-end HTTP vs adapter-only smoke?**
Option (a) Full HTTP: `POST /api/workflows/:id/run` → SSE stream → file system assertion. Exercises dispatcher + precondition + asset-writer + repo + route. ~200 LOC test file.
Option (b) Adapter-only: call workflow `run()` generator directly with mocked route layer. Faster, narrower. ~120 LOC.
Rec: **(a)**. Whole point of this step is to catch SDK-regression via the full prod path. Adapter-only smokes already exist at `tests/live/providers.gemini-live.test.ts` + `providers.vertex-live.test.ts`. No value duplicating.

**Q2 — Profile + fixture strategy?**
Live smokes need a real profile (+ real screenshots for style-transform + aso-screenshots). Options:
- (a) Create a dedicated `smoke-profile.json` fixture at `tests/live/fixtures/` with minimal valid data + 1 screenshot PNG; import + seed per-test.
- (b) Reuse an existing profile from `data/profiles/*.json` (chartlens has screenshots).
- (c) Create a new profile via `POST /api/profiles` at test setup, upload a dummy screenshot, teardown on done.
Rec: **(c) via `beforeAll`**, teardown via `afterAll`. Hermetic, no fixture drift risk. Dummy screenshot = small 64×64 checkerboard PNG generated in-memory, written via `POST /api/profiles/:id/upload-asset` with `kind=screenshot`. Adds ~15 LOC setup.

**Q3 — Run minimalism: 1 concept × 1 variant for all?**
Artwork-batch + style-transform + aso-screenshots all accept `numConcepts` + `numVariants` directly. Ad-production uses `(layout, copy)` pairs — `numConcepts: 1` means 1 pair = 1 asset. All 4 happily go down to 1×1.
Rec: **yes, 1×1 for all**. Tightest billable call. Minimizes ~60% on Gemini (which charges per-image).

**Q4 — Parameterize or duplicate?**
Option (a) single `it.each(PAIRS)("smoke $workflow × $modelId", ...)` with a PAIRS array of 11 entries. DRY, 1 assertion pattern.
Option (b) 11 handwritten `it(...)` blocks grouped by workflow. More LOC but per-workflow input customization is inlined (style-transform needs `sourceAssetId`, aso-screenshots needs `targetLangs`).
Rec: **(a) with a `buildInput(workflowId, profile)` helper** that switches on workflowId. Keeps the test file ≤250 LOC under the 300 cap.

**Q5 — Assertion depth: file-exists + size, or also PNG magic-byte + dimensions?**
Option (a) File exists + size > 1KB. Fast, catches "didn't write at all".
Option (b) + PNG header magic bytes `89 50 4E 47`. Catches "wrote garbage".
Option (c) + decode dimensions via `sharp` or similar. Catches "wrong aspect ratio".
Rec: **(b)**. Magic bytes = 4 bytes, zero cost, catches truncated downloads + write corruption. `sharp` not in deps; adding it for one test = new infra.

## Bonus considerations

**Bonus A — Sequential vs parallel test execution?**
Vitest default is parallel per-file (but serial within a file). 11 parallel Gemini calls might hit rate limits (unknown; depends on tier). Rec: **serial within file** (`describe.sequential`) to respect real-world throttling.

**Bonus B — Failure log fidelity.**
If a live smoke fails, console needs to show: the full prompt + SDK response body (if any) + the batch ID + the assetId + the expected file path. Rec: **catch at the `it(...)` level and `console.error` with full context before rethrow.** Makes debugging a failed $1.10 run much easier.

**Bonus C — Cost-tracking assertion.**
`GenerateResult.costUsd` is now stamped by the adapter (Session #21). We could also assert `asset.costUsd === adapter's COST table value` for each pair. Catches cost-table regressions. Rec: **yes, +1 line per test**. Reuses the unit-level COST_TABLE values.

**Bonus D — Cleanup.**
11 tests = 11 written PNG files under `data/assets/<profile>/<date>/`. Accumulates over runs. Rec: **`afterAll` deletes the test-profile's directory.** Optional env flag `KEEP_SMOKE_ASSETS=1` to retain for manual review.

**Bonus E — Flaky-retry.**
SDK calls can transiently 503. Rec: **no automatic retry at test level**. If Gemini/Vertex is down, retrying masks the outage. Bro re-runs manually.

## Carry-over from Session #22

- **Banner + tooltip UI confirmed in browser** (Claude_Preview MCP). Non-compat-path UX untouched, no regression risk.
- **Health cache + cost tracking pipelines hot**; live smoke will implicitly exercise them. If real Gemini returns unexpected `costUsd` mismatches, flag as Phase 5 cost-tier investigation (Imagen 1K/2K split pending).
- **`BOOTSTRAP-PHASE4.md` Step 2 SDK reference still stale** — note at Session #22 handoff carried over. Fix in Session #24 Step 8 (along with the session-number fix flagged above).
- **No jsdom / testing-library added**. Session #22 pure-fn pattern stands: pure fns = testable in Node; components = typecheck + browser smoke.

## Phase 4 roadmap after Session #23

| Step | Title | Session |
|---|---|---|
| 7 | 11 live smoke tests (real keys, ~$1.10/run) | #23 (this) — bro-gated |
| 8 | Phase 4 close + browser E2E + BOOTSTRAP fixups + PHASE-STATUS | #24 |

Session #23 is **bro-gated** — can't run the 11 smokes without credentials + budget approval. But code + scaffold (tests/live/workflows-smoke.test.ts + package.json script + fixture loader) can land regardless; bro runs the actual suite when keys are ready.

Estimated time Session #23: **2-3h** (1h code scaffold + 1-2h bro-gated run + triage). Expected regression: 497 → 497 (live excluded from `regression:full` per vitest config).

## Commit discipline reminder (unchanged)

- `feat:` for src + test files; `docs:` for PHASE-STATUS / BOOTSTRAP updates. Split commits for clean git log.
- Include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Never amend. Never `--no-verify`. Never force-push.
- Don't push to origin without bro say-so (15 commits ahead; bro waiting until Phase 4 close to push).

## Working style (unchanged)

- Bro calls: **bro**. Bilingual VN/EN. Short concise replies.
- Don't code until bro confirms alignment on scope Qs.
- Cite PLAN section when creating files.
- `<300` LOC hard cap per file (smoke test file likely ~200-250).
- Pin exact versions (no `^`). No new deps without asking.
- Live smoke run = billable action — confirm budget with bro before invoking.

---

*Session #22 closed 2026-04-23 — compat banner shipped, 497/497 green. Next: 11 live smokes against real Gemini + Vertex APIs.*
