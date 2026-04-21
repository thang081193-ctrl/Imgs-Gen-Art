# Images Gen Art

Local artwork generation platform consolidating Genart-1/2/3 kernels into a single unified tool. 4 workflows × 3 providers, runs on `127.0.0.1` only.

## Setup

```bash
# Node 20 LTS
npm install

# Copy env stub and edit as needed
cp .env.local.example .env.local

# Regression gate (lint + LOC + unit tests)
npm run regression

# Start both server (5174) + client (5173)
npm run dev
```

Open http://localhost:5173.

## Layout (summary)

- `src/core/**` — universal: types, Zod schemas, pure logic, design tokens
- `src/server/**` — all I/O: providers (Gemini + Vertex SDKs), keys (AES-256-GCM), SQLite, routes
- `src/client/**` — React + Vite UI
- `src/workflows/**` — 4 workflow modules (artwork-batch, ad-production, style-transform, aso-screenshots)
- `scripts/**` — extraction, migrations, LOC check
- `tests/**` — unit + integration + (optional) live

See `PLAN-v2.2.1.md` for full blueprint.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Concurrent server + client |
| `npm run dev:server` | Hono on 127.0.0.1:5174 |
| `npm run dev:client` | Vite on 127.0.0.1:5173 |
| `npm run build` | Server tsc + client Vite build |
| `npm run lint` | ESLint per-folder boundary enforcement |
| `npm run check-loc` | Rule 7 hard cap (300 LOC per file) |
| `npm run test` | Vitest — unit + integration |
| `npm run regression` | lint + check-loc + unit |
| `npm run regression:full` | lint + check-loc + full tests |

## Rules recap

15 anti-patterns in `CONTRIBUTING.md`. ESLint + `check-loc` enforce mechanically; review catches the rest.
