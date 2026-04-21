/**
 * check-loc.ts — enforces CONTRIBUTING Rule 7 (hard cap 300 content LOC).
 * Counts non-blank, non-pure-comment lines in src/**\/*.{ts,tsx}.
 * Excludes data/constants files per Rule 7 exception (src/core/design/tokens.ts).
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

const ROOT = process.cwd()
const SRC = join(ROOT, "src")
const HARD_CAP = 300
const SOFT_CAP = 250

// Files excluded from LOC cap (constants / data tables per Rule 7 exception).
const EXCLUDED = new Set<string>([
  join("src", "core", "design", "tokens.ts"),
])

function walk(dir: string): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

function countContentLoc(source: string): number {
  const lines = source.split(/\r?\n/)
  let count = 0
  let inBlockComment = false
  for (const raw of lines) {
    const line = raw.trim()
    if (line === "") continue
    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false
      continue
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlockComment = true
      continue
    }
    if (line.startsWith("//")) continue
    count++
  }
  return count
}

function main(): void {
  const files = walk(SRC)
  const violations: { path: string; loc: number }[] = []
  const warnings: { path: string; loc: number }[] = []

  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join("/")
    const normalized = relative(ROOT, file)
    if (EXCLUDED.has(normalized)) continue
    const loc = countContentLoc(readFileSync(file, "utf8"))
    if (loc > HARD_CAP) violations.push({ path: rel, loc })
    else if (loc > SOFT_CAP) warnings.push({ path: rel, loc })
  }

  if (warnings.length > 0) {
    console.warn(`[check-loc] ${warnings.length} file(s) above soft cap (${SOFT_CAP}):`)
    for (const w of warnings) console.warn(`  ${w.path} — ${w.loc} LOC`)
  }

  if (violations.length > 0) {
    console.error(`[check-loc] FAIL: ${violations.length} file(s) exceed hard cap (${HARD_CAP}):`)
    for (const v of violations) console.error(`  ${v.path} — ${v.loc} LOC`)
    process.exit(1)
  }

  console.log(`[check-loc] OK — scanned ${files.length} file(s), 0 violations.`)
}

main()
