// Layer 3 — upstream vendor drift tripwire (Session #9, approved by bro).
// Pins SHA-256 of each extracted JSON. Mismatch means either:
//   (a) vendor/ source changed (intentional — update the pinned hash + re-verify), or
//   (b) an extract script started emitting different output (investigate!).
//
// This is NOT a gate against edits — it's a notification that re-audit is due.
// To update after a legitimate vendor change: run `npm run extract:all`, then
// paste the new hashes below (compute via the command documented at file head).
//
// Compute command:
//   node -e "const fs=require('fs'),c=require('crypto');for(const f of
//     ['artwork-groups','ad-layouts','country-profiles','style-dna','i18n','copy-templates'])
//     console.log(f+':',c.createHash('sha256').update(
//       fs.readFileSync('data/templates/'+f+'.json')).digest('hex'))"

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const DIR = join(process.cwd(), "data", "templates")

const PINNED_HASHES: Record<string, string> = {
  "artwork-groups.json":  "bb9c50f2c28586f1707c4a3183e287d66c8ec9107a883cdcc631e3871b33f54b",
  "ad-layouts.json":      "4fb42b3fc62a66bb58140784d573576a41c8cb37dd763a759a1069c71092e90a",
  "country-profiles.json":"8e161624ce5c3ec24ea7e06521717dbcb15ea719d39a6825416e8a7c1abb9546",
  "style-dna.json":       "f5760300f2837b78951a88e364ddf0c4df68655f6219c8630c1e91e7bde4ac76",
  "i18n.json":            "8c136dce4f1ce62eddc73c17dba91e8f16e24260fde35973a42e7394c0f8224f",
  "copy-templates.json":  "d065154992e027fb1f6ebec976954745497787fd3fecfb1410288fdb52f47774",
}

describe("Phase 2 extract — upstream snapshot tripwire", () => {
  for (const [filename, expected] of Object.entries(PINNED_HASHES)) {
    it(`${filename} SHA-256 matches pinned Session #9 value`, () => {
      const actual = createHash("sha256").update(readFileSync(join(DIR, filename))).digest("hex")
      expect(actual, `upstream drift in ${filename} — re-audit vendor change, then update pin`).toBe(expected)
    })
  }
})
