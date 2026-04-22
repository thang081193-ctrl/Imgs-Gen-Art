// Dispatcher post-abort grace window — Session #16 fix.
//
// When controller.signal.aborted fires mid-stream, the dispatcher used to
// early-return on ANY next yield except `aborted`. That cut off legitimate
// `error` events (provider.generate throws when its abort listener fires)
// and robbed the workflow of the chance to yield its own `aborted` shutdown
// frame on the next loop iteration. Session #10 D2 reserves the dispatcher
// for DEFENSIVE-only early-exit; the new policy is a 5-event grace window
// after abort, during which the workflow is expected to self-terminate.

import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { AppProfile } from "@/core/schemas/app-profile"
import type { WorkflowEvent } from "@/core/dto/workflow-dto"
import type { WorkflowRequirement } from "@/core/compatibility/types"
import { ALL_MODELS, MODEL_IDS } from "@/core/model-registry/models"
import { dispatch } from "@/server/workflows-runtime/dispatcher"
import type { WorkflowDefinition } from "@/workflows"

const stubProfile: AppProfile = {
  version: 1,
  id: "stub-profile",
  name: "Stub",
  tagline: "stub",
  category: "utility",
  assets: { appLogoAssetId: null, storeBadgeAssetId: null, screenshotAssetIds: [] },
  visual: {
    primaryColor: "#000000",
    secondaryColor: "#111111",
    accentColor: "#222222",
    tone: "minimal",
    doList: [],
    dontList: [],
  },
  positioning: { usp: "u", targetPersona: "t", marketTier: "global" },
  context: { features: [], keyScenarios: [], forbiddenContent: [] },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
} as AppProfile

const requirement: WorkflowRequirement = {
  required: ["supportsTextToImage"],
  preferred: [],
}

function buildWorkflow(events: WorkflowEvent[]): WorkflowDefinition {
  return {
    id: "artwork-batch",
    displayName: "Stub",
    description: "stub",
    colorVariant: "violet",
    requirement,
    compatibilityOverrides: [],
    inputSchema: z.object({}).strict().passthrough(),
    async *run(): AsyncGenerator<WorkflowEvent> {
      for (const ev of events) yield ev
    },
  }
}

const baseDeps = (workflow: WorkflowDefinition) => ({
  getWorkflow: () => workflow,
  loadProfile: () => stubProfile,
  resolveModel: (id: string) => ALL_MODELS.find((m) => m.id === id),
  hasActiveKey: () => true,
})

const baseParams = {
  workflowId: "artwork-batch" as const,
  profileId: "stub-profile",
  providerId: "mock",
  modelId: MODEL_IDS.MOCK_FAST,
  aspectRatio: "1:1" as const,
  input: {},
  batchId: "batch_disp_01",
}

async function drainPullTwoThenAbortRest(
  wf: WorkflowDefinition,
  controller: AbortController,
): Promise<WorkflowEvent[]> {
  const events: WorkflowEvent[] = []
  const gen = dispatch(baseParams, { ...baseDeps(wf), controller })
  events.push((await gen.next()).value as WorkflowEvent)
  events.push((await gen.next()).value as WorkflowEvent)
  controller.abort()
  for await (const e of gen) events.push(e)
  return events
}

describe("dispatcher — post-abort grace window (Session #16 fix)", () => {
  it("forwards error + aborted within grace window after abort fires", async () => {
    const wf = buildWorkflow([
      { type: "started", batchId: "batch_disp_01", total: 2 },
      { type: "image_generated", asset: { id: "a1" } as never, index: 0 },
      // workflow proceeds post-abort: provider throws → error → workflow's
      // next-iter abort check → aborted. Both should pass through dispatcher.
      { type: "error", error: { message: "aborted" }, context: "g0", index: 1 },
      { type: "aborted", batchId: "batch_disp_01", completedCount: 1, totalCount: 2 },
    ])

    const types = (await drainPullTwoThenAbortRest(wf, new AbortController()))
      .map((e) => e.type)
    expect(types).toEqual(["started", "image_generated", "error", "aborted"])
  })

  it("defensive-returns when workflow keeps yielding normal events past grace window", async () => {
    // 10 image_generated events after abort; grace window is 5 → dispatcher
    // cuts off partway through. Never sees `complete` (which isn't emitted).
    const noisy: WorkflowEvent[] = [
      { type: "started", batchId: "batch_disp_01", total: 12 },
      { type: "image_generated", asset: { id: "a0" } as never, index: 0 },
    ]
    for (let i = 1; i <= 10; i++) {
      noisy.push({ type: "image_generated", asset: { id: `a${i}` } as never, index: i })
    }
    const wf = buildWorkflow(noisy)

    const events = await drainPullTwoThenAbortRest(wf, new AbortController())
    const types = events.map((e) => e.type)
    expect(types[0]).toBe("started")
    expect(types[1]).toBe("image_generated")
    // Grace window = 5 post-abort events, so total forwarded ≤ 7 (2 pre-abort + 5 grace).
    expect(events.length).toBeLessThanOrEqual(7)
    expect(types).not.toContain("aborted")
    expect(types).not.toContain("complete")
  })

  it("honors workflow's own `complete` as terminal (no early cutoff)", async () => {
    // Abort fires mid-stream, workflow ignores it and emits `complete`.
    // Since `complete` is a terminal break in dispatcher, the extra frames
    // AFTER complete would never be forwarded — but we verify the complete
    // itself gets through within grace.
    const wf = buildWorkflow([
      { type: "started", batchId: "batch_disp_01", total: 2 },
      { type: "image_generated", asset: { id: "a1" } as never, index: 0 },
      { type: "image_generated", asset: { id: "a2" } as never, index: 1 },
      { type: "complete", assets: [], batchId: "batch_disp_01" },
    ])

    const types = (await drainPullTwoThenAbortRest(wf, new AbortController()))
      .map((e) => e.type)
    expect(types).toContain("complete")
  })
})
