---
name: Feedback — show evidence before claiming done
description: Bro enforces "run the test, show the output" before any green claim (HANDOFF rule #7)
type: feedback
originSessionId: cc85cf7e-9da7-437f-8b22-dd56696cf066
---
**Never claim a test passes, a build works, or a change is complete without showing the evidence.**

Why: HANDOFF-PROMPT.md rule #7 explicit: *"Show, don't assume. After creating a file, show its content. After running a test, show output. Don't claim something works without evidence."* Pham validated this in Session #17 by explicitly telling me to block on baseline verification (*"BASELINE CHECK BEFORE CODING"*) before starting Step 9 code.

How to apply:
- Before saying "test passes": run it, paste the `X passed (Y)` line.
- Before saying "regression green": run `npm run regression:full` (or the equivalent narrower script), show the final summary block.
- Before marking a PHASE-STATUS entry "DONE": run the gate commands (lint, typecheck, check-loc, test) in the session, paste outputs into the PHASE-STATUS QA gate block.
- If a test can't be run (env blocker like Node missing, vendor/ missing) — BLOCK with that info, don't invent "should pass" language.

Corollary: integration over mocked claims. When the runtime middleware scans for banned keys in dev-only mode, back it up with an integration test (Session #17 `dto-no-paths-full.test.ts`) that actually fetches routes and scans responses — not a unit test that mocks the scanner behavior.
