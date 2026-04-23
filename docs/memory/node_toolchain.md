---
name: Node toolchain on Pham's home PC (Windows)
description: fnm + Node 20 LTS; workaround for stale Node 24 PATH entry that breaks better-sqlite3 native binary
type: reference
originSessionId: cc85cf7e-9da7-437f-8b22-dd56696cf066
---
Project target: Node 20 LTS (`package.json` engines: `>=20.0.0`). Specifically needed because `better-sqlite3` 11.7.2 ships prebuilt binaries for Node 20 (NODE_MODULE_VERSION 115) — no prebuilt for Node 24 (137), which would require MSVC toolchain to rebuild.

Pham's **home PC** (this box, `D:\Dev\Tools\Img Content Gen\`):
- Uses **fnm** (Fast Node Manager) to switch versions. Installed via `winget install Schniz.fnm`.
- Node 20.20.2 installed via `fnm install 20`. fnm multishell dir at `C:\Users\Thang Dep Dai\AppData\Roaming\fnm\node-versions\v20.20.2\installation`.
- **Stale PATH entry** `C:\Program Files\nodejs\` points to a Node 24 residue folder that no longer exists — ignore it, fnm takes precedence when PATH is configured.
- Every PowerShell command needs PATH prefix: `$env:PATH = "C:\Users\Thang Dep Dai\AppData\Roaming\fnm\node-versions\v20.20.2\installation;$env:PATH"` before `npm` / `node` calls (session-local env doesn't persist across tool invocations).

Pham's **office PC**: setup unknown but assumed to have clean Node 20 install + vendor/ already cloned (he said "push rồi lên pc văn phòng làm tiếp" = push then continue on office PC).

If Node 24 gets onto PATH again and breaks builds:
- Symptom: `NODE_MODULE_VERSION 115 ... requires 137` for better-sqlite3.
- Fix: don't `npm rebuild` (no prebuilts, needs MSVC). Switch back to Node 20 via fnm.
