// Session #27a — shared internal shape for replay execution. Split into its
// own module so replay-payload-reader.ts (normalize) and replay-asset-writer
// (persist) can import the type without introducing a cycle through
// replay-service.ts.

import type { AspectRatio, LanguageCode } from "@/core/model-registry/types"

export interface ReplayExecuteFields {
  prompt: string
  providerId: string
  modelId: string
  seed?: number
  aspectRatio: AspectRatio
  language?: LanguageCode
  addWatermark: boolean
  negativePrompt?: string
}
