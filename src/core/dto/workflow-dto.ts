// Plan §6.3 — WorkflowEvent (transport-safe; carries AssetDto, never raw Asset).

import type { AssetDto } from "./asset-dto"

export interface Concept {
  id: string
  title: string
  description: string
  seed?: number
  tags: string[]
}

export type WorkflowEvent =
  | { type: "started"; batchId: string; total: number }
  | { type: "concept_generated"; concept: Concept; index: number }
  | { type: "image_generated"; asset: AssetDto; index: number }
  | { type: "error"; error: { message: string; code?: string }; context: string; index?: number }
  | { type: "aborted"; batchId: string; completedCount: number; totalCount: number }
  | { type: "complete"; assets: AssetDto[]; batchId: string }
