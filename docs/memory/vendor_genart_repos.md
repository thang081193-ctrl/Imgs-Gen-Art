---
name: Vendor Genart source repos
description: The 3 upstream AI Studio apps that Phase 2 extractors parse — gitignored, manual clone required on fresh machines
type: reference
originSessionId: cc85cf7e-9da7-437f-8b22-dd56696cf066
---
`vendor/genart-{1,2,3}/` contains the 3 upstream apps whose static data (ARTWORK_GROUPS, AD_LAYOUTS, COUNTRY_OVERRIDES, ZONE_BASE, I18N, COPY_TEMPLATES, ART_STYLES) is extracted at build time per Phase 2 scripts.

Clone URLs (Pham's GitHub):
- https://github.com/thang081193-ctrl/Genart-1 → `vendor/genart-1`
- https://github.com/thang081193-ctrl/Genart-2 → `vendor/genart-2`
- https://github.com/thang081193-ctrl/Genart-3 → `vendor/genart-3`

Why this matters for future sessions:
- `vendor/` is in `.gitignore` — fresh clones of `Imgs-Gen-Art` don't have it.
- Without it, `tests/extraction/determinism.test.ts` fails with "File not found: vendor/genart-1/types.ts" (drops 1 test from the 345/378 baseline).
- Extraction scripts (`scripts/extract-genart-{1,2,3}.ts`) fail-fast per CONTRIBUTING Rule 12 — they can't degrade silently.

Fresh-machine bootstrap:
```bash
cd Imgs-Gen-Art
mkdir -p vendor
cd vendor
git clone https://github.com/thang081193-ctrl/Genart-1 genart-1
git clone https://github.com/thang081193-ctrl/Genart-2 genart-2
git clone https://github.com/thang081193-ctrl/Genart-3 genart-3
```
