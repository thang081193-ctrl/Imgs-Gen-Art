# ArtForge — Handoff Prompt for Coding Session

Paste this at the start of your coding session. Attach the 3 planning files as context.

---

## Context for you (the coding assistant)

I'm Pham, Android app developer based in Hanoi. I've spent 5 planning iterations with 4 Codex peer review rounds designing **ArtForge** — a local artwork generation platform consolidating 3 of my existing AI Studio apps (Genart-1/2/3) into one unified tool.

The planning is DONE. Your job is to scaffold the codebase following the plan exactly. Don't re-architect. Don't suggest plan changes. The plan has been peer-reviewed 4 times. Just build what's specified.

## What to read FIRST (required)

Read these 3 files in order before writing any code:

1. **`PLAN-v2.2.1.md`** — full technical blueprint (1763 lines). Contains folder tree, data schemas, module contracts, 10+ explicit TypeScript type definitions, API spec with preconditions, phased rollout.

2. **`CONTRIBUTING.md`** — 15 anti-pattern rules with ❌/✅ examples. These are NON-NEGOTIABLE. Lint enforces most of them.

3. **`DECISIONS.md`** — decision log including items explicitly rejected with reasons. Don't re-propose them:
   - `gemini-3.1-flash-image-preview` IS correct (Nano Banana 2) — don't change to `gemini-2.5-flash-image`
   - Tag index strategy deferred post-v1
   - DB size monitoring deferred post-v1
   - Resume-after-cancel out of scope v1

Confirm you've read them by listing the 4 workflows v1 and the 3 providers with their model IDs.

## What we're building — 30-second summary

- Local tool: Hono server (port 5174, binds 127.0.0.1) + Vite React client (port 5173, proxy `/api`)
- 4 workflows: artwork-batch, ad-production, style-transform, aso-screenshots
- 3 real providers: Gemini NB Pro, Gemini NB 2 (default), Imagen 4; plus Mock for tests
- Key management: multi-slot per provider, AES-256-GCM encrypted at rest
- SQLite for assets, JSON files for AppProfiles, encrypted file for keys
- Strict boundary: `src/core` = universal; `src/server` = all I/O + SDK; `src/client` = React; `src/workflows` = runners + UI

## Working style rules

1. **Read plan first, code second.** Before creating any file, cite the section of PLAN-v2.2.1.md you're implementing.

2. **Follow BOOTSTRAP.md step order.** It breaks Phase 1 Week 1 into 7 steps. Don't skip ahead. Finish each step (file created + test green + bro confirms) before next.

3. **Don't over-engineer.** Rule 1 is "clean, lean". No DI container, no Redux, no state machine lib. `useState` + Context only.

4. **Bilingual OK.** I mix Vietnamese and English, call me "bro". You can reply in whichever matches my message.

5. **Ask before structural changes.** If the plan says folder `X/Y/Z.ts` and you want to split it — ask first. Plan has been peer-reviewed; changes need justification.

6. **Hard 300 LOC cap per file.** If a file approaches 250 lines, think about splitting. 300 = blocker.

7. **Show, don't assume.** After creating a file, show its content. After running a test, show output. Don't claim something works without evidence.

8. **Conservative with tools.** `better-sqlite3` over `drizzle`. `@google/genai` over wrappers. Pin versions. No new dependencies without asking.

## What NOT to do

- Don't port Genart-1/2/3 `App.tsx`, service layers, or UI code verbatim. Extraction scripts pull static data only; kernels get rewritten clean.
- Don't add features beyond Phase 1 deliverables. Phases 2-6 come later.
- Don't make the project "production-grade" with Docker, CI/CD, auth middleware. This is a **local single-user tool**. No auth, no containers, no cloud.
- Don't generate placeholder code with `// TODO: implement`. If a function is needed, write it. If you can't, stop and ask.
- Don't introduce ORMs, query builders, or framework abstractions not in the plan.

## Environment

- OS: Windows, WSL2 available
- Node.js 20 LTS
- Package manager: `npm` (per plan)
- Editor: VS Code
- Shell: PowerShell and Bash both work
- Target location: `D:\Dev\Tools\ArtForge` (bro will git init there)

## Session structure

Each coding session follows this pattern:

1. Bro says what step from BOOTSTRAP.md to work on
2. You read the relevant PLAN-v2.2.1.md section
3. You write files for that step
4. You run `npm run lint && npm run check-loc && npm test -- [relevant]`
5. Show test output
6. Bro reviews, confirms or asks for fixes
7. Move to next step

**Don't try to finish all of Phase 1 Week 1 in one session.** 7 steps across 3-5 sessions is normal pace.

## First turn: setup verification

Before ANY code, on your first response:

1. Confirm you've read all 3 planning files
2. List the 4 workflows with their color variants (per §4 of plan)
3. List the 4 provider:model combos with their default parameters
4. List the 15 anti-pattern rules by name only (one per line)
5. Ask me which of the 7 BOOTSTRAP.md steps you should start with

DO NOT write code in the first turn. We need alignment first.

---

*Generated from ArtForge planning sessions — 5 iterations, 4 Codex review rounds. Final scaffold-ready plan as of 2026-04-20.*
