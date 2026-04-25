// Phase C3 (Session #43) — finalizeBatch + policy_decision_json wiring.
//
// Asserts the audit blob writer behavior:
//   - decision supplied → JSON written to batches.policy_decision_json
//   - decision absent → column stays NULL (existing-caller compat)
//   - bad batch id throws (defensive — surfaces a wiring bug early)

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  _resetAssetStoreForTests,
  finalizeBatch,
  getAssetRepo,
  getBatchRepo,
  initAssetStore,
} from "@/server/asset-store"
import type { PolicyDecision } from "@/core/schemas/policy-decision"

const DECISION: PolicyDecision = {
  decidedAt: "2026-04-25T10:00:00.000Z",
  ok: false,
  violations: [
    {
      ruleId: "no-miracle",
      severity: "block",
      kind: "keyword-blocklist",
      message: "Matched blocked keyword \"miracle\".",
      details: { keyword: "miracle", caseInsensitive: true },
    },
  ],
}

describe("finalizeBatch + policyDecision", () => {
  beforeEach(() => {
    _resetAssetStoreForTests()
    initAssetStore({ path: ":memory:" })
  })
  afterEach(() => _resetAssetStoreForTests())

  it("policyDecision supplied → JSON written; round-trips through findById", () => {
    const batchRepo = getBatchRepo()
    const assetRepo = getAssetRepo()
    batchRepo.create({
      id: "b1",
      profileId: "p1",
      workflowId: "artwork-batch",
      totalAssets: 0,
      status: "running",
      startedAt: "2026-04-25T09:59:00.000Z",
    })

    finalizeBatch({
      batchId: "b1",
      status: "completed",
      assetRepo,
      batchRepo,
      at: "2026-04-25T10:00:01.000Z",
      policyDecision: DECISION,
    })

    const batch = batchRepo.findById("b1")
    expect(batch?.policyDecisionJson).not.toBeNull()
    const parsed = JSON.parse(batch!.policyDecisionJson!) as PolicyDecision
    expect(parsed.ok).toBe(false)
    expect(parsed.violations).toHaveLength(1)
    expect(parsed.violations[0]?.ruleId).toBe("no-miracle")
  })

  it("policyDecision absent → column stays NULL (back-compat for existing callers)", () => {
    const batchRepo = getBatchRepo()
    const assetRepo = getAssetRepo()
    batchRepo.create({
      id: "b2",
      profileId: "p1",
      workflowId: "artwork-batch",
      totalAssets: 0,
      status: "running",
      startedAt: "2026-04-25T09:59:00.000Z",
    })

    finalizeBatch({
      batchId: "b2",
      status: "completed",
      assetRepo,
      batchRepo,
      at: "2026-04-25T10:00:01.000Z",
    })

    const batch = batchRepo.findById("b2")
    expect(batch?.policyDecisionJson).toBeNull()
  })

  it("updatePolicyDecision throws on unknown batch id", () => {
    const batchRepo = getBatchRepo()
    expect(() =>
      batchRepo.updatePolicyDecision("nonexistent", DECISION),
    ).toThrow(/unknown batch id/)
  })

  it("updatePolicyDecision validates payload via schema (rejects malformed)", () => {
    const batchRepo = getBatchRepo()
    batchRepo.create({
      id: "b3",
      profileId: "p1",
      workflowId: "artwork-batch",
      totalAssets: 0,
      status: "running",
      startedAt: "2026-04-25T09:59:00.000Z",
    })
    expect(() =>
      // Cast via unknown so TS allows the bad shape into the assertion.
      batchRepo.updatePolicyDecision("b3", {
        decidedAt: "not-a-date",
        ok: true,
        violations: [],
      } as unknown as PolicyDecision),
    ).toThrow()
  })
})
