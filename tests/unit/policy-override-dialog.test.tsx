// @vitest-environment jsdom
//
// Phase C3 (Session #43) — PolicyOverrideDialog unit tests.
// Asserts: 1 textarea per warning ruleId, blocks rendered read-only,
// confirm returns PolicyOverride[], cancel returns nothing.

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react"

import { PolicyOverrideDialog } from "@/client/components/PolicyOverrideDialog"
import type {
  PolicyOverride,
  PolicyViolation,
} from "@/client/api/policy-rules-hooks"

afterEach(() => cleanup())

const WARN_VIOLATIONS: PolicyViolation[] = [
  {
    ruleId: "warn-a",
    severity: "warning",
    kind: "keyword-blocklist",
    message: "matched A",
  },
  {
    ruleId: "warn-b",
    severity: "warning",
    kind: "claim-regex",
    message: "matched B",
  },
]

const BLOCK_VIOLATION: PolicyViolation = {
  ruleId: "block-x",
  severity: "block",
  kind: "aspect-ratio",
  message: "wrong AR",
}

describe("PolicyOverrideDialog", () => {
  it("renders 1 textarea per unique warning ruleId", () => {
    render(
      <PolicyOverrideDialog
        open
        violations={WARN_VIOLATIONS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByTestId("policy-override-reason-warn-a")).toBeInTheDocument()
    expect(screen.getByTestId("policy-override-reason-warn-b")).toBeInTheDocument()
  })

  it("dedupes warnings by ruleId (multi-match keyword rule = 1 textarea)", () => {
    const dupes: PolicyViolation[] = [
      { ...WARN_VIOLATIONS[0]!, message: "match 1" },
      { ...WARN_VIOLATIONS[0]!, message: "match 2" },
      { ...WARN_VIOLATIONS[0]!, message: "match 3" },
    ]
    render(
      <PolicyOverrideDialog
        open
        violations={dupes}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId(/^policy-override-reason-/)).toHaveLength(1)
  })

  it("renders block rows read-only and disables confirm when block present", () => {
    const onConfirm = vi.fn()
    render(
      <PolicyOverrideDialog
        open
        violations={[...WARN_VIOLATIONS, BLOCK_VIOLATION]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId("policy-override-block-row")).toHaveLength(1)
    const confirmBtn = screen.getByRole("button", { name: /proceed with overrides/i })
    expect(confirmBtn).toBeDisabled()
  })

  it("confirm returns PolicyOverride[] keyed to filled reasons", () => {
    const onConfirm = vi.fn<(o: PolicyOverride[]) => void>()
    render(
      <PolicyOverrideDialog
        open
        violations={WARN_VIOLATIONS}
        decidedBy="p1"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    const ta1 = screen.getByTestId("policy-override-reason-warn-a") as HTMLTextAreaElement
    const ta2 = screen.getByTestId("policy-override-reason-warn-b") as HTMLTextAreaElement
    act(() => {
      fireEvent.change(ta1, { target: { value: "approved by legal" } })
      fireEvent.change(ta2, { target: { value: "marketing edge case" } })
    })
    act(() => {
      screen.getByRole("button", { name: /proceed with overrides/i }).click()
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const overrides = onConfirm.mock.calls[0]![0]
    expect(overrides).toHaveLength(2)
    expect(overrides[0]).toMatchObject({
      ruleId: "warn-a",
      reason: "approved by legal",
      decidedBy: "p1",
    })
    expect(overrides[0]?.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("confirm disabled until every warning has a reason", () => {
    render(
      <PolicyOverrideDialog
        open
        violations={WARN_VIOLATIONS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const btn = screen.getByRole("button", { name: /proceed with overrides/i })
    expect(btn).toBeDisabled()

    act(() => {
      fireEvent.change(
        screen.getByTestId("policy-override-reason-warn-a"),
        { target: { value: "ok" } },
      )
    })
    expect(btn).toBeDisabled()

    act(() => {
      fireEvent.change(
        screen.getByTestId("policy-override-reason-warn-b"),
        { target: { value: "ok" } },
      )
    })
    expect(btn).not.toBeDisabled()
  })

  it("cancel button calls onCancel and does NOT call onConfirm", () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <PolicyOverrideDialog
        open
        violations={WARN_VIOLATIONS}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    act(() => {
      screen.getByRole("button", { name: /cancel/i }).click()
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("renders nothing when open=false", () => {
    render(
      <PolicyOverrideDialog
        open={false}
        violations={WARN_VIOLATIONS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByTestId("policy-override-dialog")).not.toBeInTheDocument()
  })
})
