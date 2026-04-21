// Plan §7.2 — runtime validator.
// Checks requested aspectRatio + language against the selected model's capability at run time.
// Returns a typed result; routes convert failure to 409 RUNTIME_VALIDATION_FAILED.

import type { AspectRatio, LanguageCode, ProviderCapability } from "../model-registry/types"

export interface RuntimeValidateParams {
  capability: ProviderCapability
  aspectRatio: AspectRatio
  language?: LanguageCode
}

export type RuntimeValidateResult =
  | { ok: true }
  | { ok: false; code: "ASPECT_RATIO_UNSUPPORTED" | "LANGUAGE_UNSUPPORTED"; message: string }

export function validateRuntime(params: RuntimeValidateParams): RuntimeValidateResult {
  const { capability, aspectRatio, language } = params

  if (!capability.supportedAspectRatios.includes(aspectRatio)) {
    return {
      ok: false,
      code: "ASPECT_RATIO_UNSUPPORTED",
      message: `aspectRatio ${aspectRatio} not supported; allowed: ${capability.supportedAspectRatios.join(", ")}`,
    }
  }

  if (language && !capability.supportedLanguages.includes(language)) {
    return {
      ok: false,
      code: "LANGUAGE_UNSUPPORTED",
      message: `language ${language} not supported; allowed: ${capability.supportedLanguages.join(", ")}`,
    }
  }

  return { ok: true }
}
