# /docs/memory — Claude Code Memory Snapshot

Reference copy of the Claude Code memory files from Pham's home PC as of **Session #17 (2026-04-23)**. Not auto-loaded by Claude — just committed here so the office PC / a fresh clone can read the same context without rebuilding from scratch.

## How Claude Code uses this on each machine

Claude Code stores persistent memory at `~/.claude/projects/<project-slug>/memory/`. That folder is machine-local (user home), outside this git repo. Each machine builds up its own memory independently.

If you want Claude on a fresh machine to start with the same context:

```bash
# Linux / macOS
mkdir -p ~/.claude/projects/D--Dev-Tools-Img-Content-Gen/memory
cp docs/memory/*.md ~/.claude/projects/D--Dev-Tools-Img-Content-Gen/memory/

# Windows PowerShell
$mem = "$env:USERPROFILE\.claude\projects\D--Dev-Tools-Img-Content-Gen\memory"
New-Item -ItemType Directory -Force -Path $mem
Copy-Item docs\memory\*.md -Destination $mem
```

Otherwise, Claude on the new machine will read PHASE-STATUS.md + HANDOFF-PROMPT.md and rebuild memory fresh — that path works too, just adds ~2 min of re-exploration on first session.

## Contents

- **`MEMORY.md`** — the index Claude loads first. Points to the 5 individual memories below.
- **`user_profile.md`** — who Pham is, working style, comms preferences.
- **`vendor_genart_repos.md`** — Genart-1/2/3 clone URLs (vendor/ is gitignored).
- **`node_toolchain.md`** — fnm + Node 20 LTS setup on Pham's home PC, workaround for the stale Node 24 PATH entry.
- **`phase3_close.md`** — Phase 3 closed Session #17; Phase 4 Step 1 scope.
- **`feedback_show_evidence.md`** — "show the test output" rule per HANDOFF #7.

These files are content-first; edit them like any other markdown doc. Sync back up to `~/.claude/.../memory/` when you want Claude's running memory to match.
