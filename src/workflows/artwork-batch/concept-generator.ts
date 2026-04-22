// BOOTSTRAP-PHASE3 Step 3 — deterministic concept picker for artwork-batch.
//
// Q2 decision locked Session #11: mulberry32 seeded shuffle (not SHA-256) —
// reuses src/core/shared/rand.ts, 5 LOC algorithm, same determinism guarantee.
// Q5 decision: every concept gets its own derived seed so Phase 5 replay can
// re-run one variant in isolation (per-asset replayClass = "deterministic").

import { mulberry32 } from "@/core/shared/rand"
import { shortId } from "@/core/shared/id"
import type { Concept } from "@/core/dto/workflow-dto"
import type { ArtworkGroupsFile } from "@/core/templates"
import type { ArtworkBatchInput, ArtworkGroupKeyInput } from "./input-schema"

/** Mulberry32-shuffled first N items from a pool. Deterministic for a fixed seed. */
export function pickConcepts(
  pool: readonly string[],
  count: number,
  seed: number,
): string[] {
  if (pool.length === 0) throw new Error("pickConcepts: empty pool")
  const prng = mulberry32(seed)
  const scored = pool.map((item) => ({ item, score: prng() }))
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, Math.min(count, pool.length)).map((s) => s.item)
}

/**
 * Per-concept seed derivation. Same (batchSeed, salt) → same output; distinct
 * salts yield distinct seeds. djb2-style hash so we never pull a crypto lib.
 */
export function deriveSeed(batchSeed: number, salt: string): number {
  let hash = 0
  for (let i = 0; i < salt.length; i++) {
    hash = ((hash << 5) - hash + salt.charCodeAt(i)) | 0
  }
  return (batchSeed ^ hash) >>> 0
}

export interface GenerateConceptsParams {
  input: ArtworkBatchInput
  templates: ArtworkGroupsFile
  batchSeed: number
}

export function generateConcepts(params: GenerateConceptsParams): Concept[] {
  const { input, templates, batchSeed } = params
  const group: ArtworkGroupKeyInput = input.group
  const pool = templates.groups[group]
  const titles = pickConcepts(pool, input.conceptCount, batchSeed)
  return titles.map((title) => ({
    id: shortId("cpt", 8),
    title,
    description: input.subjectDescription,
    tags: [group, title],
    seed: deriveSeed(batchSeed, title),
  }))
}
