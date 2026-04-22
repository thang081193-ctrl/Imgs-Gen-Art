// Session #15 Q5 — central replay-class classifier.
//
// Every workflow runner calls this before inserting an Asset row so the
// "deterministic" vs "best_effort" decision is made in ONE place. Phase 4
// real providers automatically get the right class as their capability
// matures (supportsDeterministicSeed flips true). Phase 3 Mock + seed +
// no-watermark currently classifies as "deterministic" — exactly what
// Phase 5 replay needs.
//
// An asset is "deterministic" only when ALL of the following hold:
//   1. provider capability advertises supportsDeterministicSeed=true
//   2. the caller passed a concrete `seed` (not undefined)
//   3. no prompt-side watermark was requested
//      (providerSpecificParams.addWatermark === false — explicit opt-out)
//
// #3 is explicit-false because watermark presence alters pixel output in
// a way the provider can't reproduce later (Imagen 4 bakes it at encode
// time, post-seed). Treating "undefined" as "false" would let future
// callers who forget the flag slip into a deterministic classification
// they don't actually have.

import type { ProviderCapability } from "../model-registry/types"
import type { ReplayClass } from "../dto/asset-dto"

export interface ReplayClassInput {
  seed?: number | undefined
  providerSpecificParams?: {
    addWatermark?: boolean | undefined
    [key: string]: unknown
  } | undefined
}

export function computeReplayClass(
  capability: ProviderCapability,
  asset: ReplayClassInput,
): ReplayClass {
  if (
    capability.supportsDeterministicSeed &&
    asset.seed !== undefined &&
    asset.providerSpecificParams?.addWatermark === false
  ) {
    return "deterministic"
  }
  return "best_effort"
}
