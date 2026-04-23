// Session #27b — Phase 5 Step 5b prep. Extracted from replay-service.ts
// (carry-forward #4 from Session #27a — the service had crept to 251 LOC,
// over the 250 soft cap). Pure-function split: given a loaded replay context
// + the client's overridePayload, produce the new execute fields + the
// re-serialized canonical payload that will be persisted on the replayed
// asset.
//
// Pure: no I/O, no DB, no registries. Easy to unit test directly.
//
// Input is structurally typed (not `LoadedReplayContext` from replay-service)
// to keep the module cycle-free. The shape matches the fields applyOverride
// actually reads — everything else (storedPayloadJson, full sourceAsset row)
// is irrelevant to override logic and stays out of the contract.

import type { ModelInfo } from "@/core/model-registry/types"
import type { OverridePayload } from "@/core/schemas/override-payload"
import type { ReplayPayload } from "@/core/schemas/replay-payload"
import {
  CapabilityNotSupportedError,
  LegacyPayloadNotEditableError,
} from "@/core/shared/errors"

import type { ReplayExecuteFields } from "./replay-execute-fields"
import type { ReplayPayloadKind } from "./replay-payload-reader"

export interface ApplyOverrideInput {
  sourceAsset: { id: string }
  model: ModelInfo
  execute: ReplayExecuteFields
  kind: ReplayPayloadKind
  canonical: ReplayPayload | null
}

export interface ApplyOverrideResult {
  execute: ReplayExecuteFields
  newPayloadJson: string
}

export function applyOverride(
  ctx: ApplyOverrideInput,
  override: OverridePayload,
): ApplyOverrideResult {
  // Legacy source → synthesizing a canonical contextSnapshot from current
  // profile state would drift from the batch-time profile. Reject loudly
  // instead of silently corrupting the audit trail.
  if (ctx.kind === "legacy" || ctx.canonical === null) {
    throw new LegacyPayloadNotEditableError(ctx.sourceAsset.id)
  }
  if (
    override.negativePrompt !== undefined &&
    !ctx.model.capability.supportsNegativePrompt
  ) {
    throw new CapabilityNotSupportedError("negativePrompt", ctx.model.id)
  }

  const prompt = override.prompt ?? ctx.execute.prompt
  const addWatermark =
    override.addWatermark !== undefined
      ? override.addWatermark
      : ctx.execute.addWatermark
  const negativePrompt =
    override.negativePrompt !== undefined
      ? override.negativePrompt
      : ctx.execute.negativePrompt

  const execute: ReplayExecuteFields = {
    ...ctx.execute,
    prompt,
    addWatermark,
    ...(negativePrompt !== undefined ? { negativePrompt } : {}),
  }

  const newCanonical: ReplayPayload = {
    ...ctx.canonical,
    prompt,
    providerSpecificParams: {
      ...ctx.canonical.providerSpecificParams,
      addWatermark,
      ...(negativePrompt !== undefined ? { negativePrompt } : {}),
    },
  }
  return { execute, newPayloadJson: JSON.stringify(newCanonical) }
}
