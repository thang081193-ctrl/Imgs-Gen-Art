// mulberry32 — deterministic 32-bit PRNG used by workflows for seed-driven selection.
// Extraction fidelity target: identical output to Genart-1/2/3 for the same seed.

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickOne<T>(rand: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pickOne: empty list")
  const idx = Math.floor(rand() * items.length)
  const clamped = idx >= items.length ? items.length - 1 : idx
  const value = items[clamped]
  if (value === undefined) throw new Error("pickOne: out-of-bounds (unreachable)")
  return value
}

/**
 * Per-concept seed derivation. Same `(batchSeed, salt)` → same output; distinct
 * salts yield distinct seeds. djb2-style hash so we never pull in a crypto lib.
 *
 * Used by every workflow to stamp a stable per-variant seed onto each Concept
 * so Phase 5 replay can re-run a single variant deterministically (asset-level
 * `replay_class = "deterministic"` once provider capability allows it).
 *
 * Workflow salt conventions (Session #15 Q7):
 *   artwork-batch:   concept.title
 *   ad-production:   `${layoutId}:${copyKey}`
 *   style-transform: `${styleDnaKey}:${sourceAssetId}`
 *   aso-screenshots: `${layoutId}:${targetLang}`
 */
export function deriveSeed(batchSeed: number, salt: string): number {
  let hash = 0
  for (let i = 0; i < salt.length; i++) {
    hash = ((hash << 5) - hash + salt.charCodeAt(i)) | 0
  }
  return (batchSeed ^ hash) >>> 0
}
