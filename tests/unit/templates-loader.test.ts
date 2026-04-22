// BOOTSTRAP-PHASE3 Step 1 — unit tests for src/server/templates/.
//
// Coverage: loadTemplate() happy-path on real committed data/templates/*.json,
// ExtractionError on missing file / malformed JSON / schema drift (via temp
// fixture directory), plus cache behaviour (memoization + preload sweeps
// all 6 templates).

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { ExtractionError } from "@/core/shared/errors"
import { ArtworkGroupsSchema, StyleDnaSchema } from "@/core/templates"
import {
  ALL_TEMPLATE_NAMES,
  _resetTemplateCacheForTests,
  getAdLayouts,
  getArtworkGroups,
  getCopyTemplates,
  getCountryProfiles,
  getI18n,
  getStyleDna,
  loadTemplate,
  preloadAllTemplates,
} from "@/server/templates"

describe("loadTemplate — real committed JSONs", () => {
  it("loads all 6 templates without throwing", () => {
    for (const name of ALL_TEMPLATE_NAMES) {
      const schema = z.object({ schemaVersion: z.literal(1) }).passthrough()
      expect(() => loadTemplate(name, schema)).not.toThrow()
    }
  })

  it("returns the parsed + validated ArtworkGroupsFile", () => {
    const out = loadTemplate("artwork-groups", ArtworkGroupsSchema)
    expect(out.schemaVersion).toBe(1)
    expect(Object.keys(out.groups).sort()).toContain("memory")
    expect(Object.keys(out.groups)).not.toContain("sexyAnime")
  })
})

describe("loadTemplate — fail-fast error paths", () => {
  let fixtureDir: string

  beforeEach(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "igenart-templates-"))
  })
  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true })
  })

  it("throws ExtractionError when the file is missing", () => {
    expect(() =>
      loadTemplate("artwork-groups", ArtworkGroupsSchema, { baseDir: fixtureDir }),
    ).toThrow(ExtractionError)
  })

  it("throws ExtractionError on malformed JSON", () => {
    writeFileSync(join(fixtureDir, "artwork-groups.json"), "{ not json ]", "utf-8")
    const run = (): unknown =>
      loadTemplate("artwork-groups", ArtworkGroupsSchema, { baseDir: fixtureDir })
    expect(run).toThrow(ExtractionError)
    expect(run).toThrow(/not valid JSON/)
  })

  it("throws ExtractionError on schema drift", () => {
    writeFileSync(
      join(fixtureDir, "style-dna.json"),
      JSON.stringify({ schemaVersion: 1, styles: { UNKNOWN: {} } }),
      "utf-8",
    )
    const run = (): unknown =>
      loadTemplate("style-dna", StyleDnaSchema, { baseDir: fixtureDir })
    expect(run).toThrow(ExtractionError)
    expect(run).toThrow(/schema validation/)
  })
})

describe("cache getters", () => {
  beforeEach(() => {
    _resetTemplateCacheForTests()
  })

  it("preloadAllTemplates loads all 6 without throwing", () => {
    expect(() => preloadAllTemplates()).not.toThrow()
  })

  it("returns the same object reference on repeat calls (memoized)", () => {
    const a = getArtworkGroups()
    const b = getArtworkGroups()
    expect(a).toBe(b)
  })

  it("each getter returns its distinct typed shape", () => {
    expect(getArtworkGroups()).not.toBe(getAdLayouts())
    expect(getI18n()).not.toBe(getCopyTemplates())
    expect(getCountryProfiles()).not.toBe(getStyleDna())
  })

  it("cache reset forces a re-read (different object reference)", () => {
    const a = getArtworkGroups()
    _resetTemplateCacheForTests()
    const b = getArtworkGroups()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
