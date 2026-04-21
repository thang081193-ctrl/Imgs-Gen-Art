// Zod validation coverage for the three canonical AppProfile seeds.
// Source of truth: scripts/seed-data/profiles/ (git-tracked).
// Runtime `data/profiles/` is gitignored and populated by `npm run seed:profiles`
// — we assert the canonical shape here so fresh clones are guaranteed-valid.

import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { AppProfileSchema } from "@/core/schemas/app-profile"

const SEED_DIR = resolve(process.cwd(), "scripts/seed-data/profiles")

const seedFiles = readdirSync(SEED_DIR).filter((f) => f.endsWith(".json")).sort()

function loadSeed(filename: string): unknown {
  return JSON.parse(readFileSync(join(SEED_DIR, filename), "utf8"))
}

describe("canonical AppProfile seeds — Zod validation", () => {
  it("directory contains the three canonical IDs", () => {
    const ids = seedFiles.map((f) => f.replace(/\.json$/, ""))
    expect(ids).toEqual(["ai-chatbot", "chartlens", "plant-identifier"])
  })

  it.each(seedFiles)("%s parses against AppProfileSchema", (filename) => {
    expect(() => AppProfileSchema.parse(loadSeed(filename))).not.toThrow()
  })

  it("every seed pins version to the Rule 14 literal (1)", () => {
    for (const filename of seedFiles) {
      const profile = AppProfileSchema.parse(loadSeed(filename))
      expect(profile.version).toBe(1)
    }
  })

  it("every seed starts with null asset IDs + empty screenshot list (Phase 5 CMS fills)", () => {
    for (const filename of seedFiles) {
      const profile = AppProfileSchema.parse(loadSeed(filename))
      expect(profile.assets.appLogoAssetId).toBeNull()
      expect(profile.assets.storeBadgeAssetId).toBeNull()
      expect(profile.assets.screenshotAssetIds).toEqual([])
    }
  })

  it("every seed filename matches its inner id field", () => {
    for (const filename of seedFiles) {
      const profile = AppProfileSchema.parse(loadSeed(filename))
      expect(`${profile.id}.json`).toBe(filename)
    }
  })
})
