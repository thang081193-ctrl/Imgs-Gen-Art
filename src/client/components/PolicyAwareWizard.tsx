// Phase D2 (Session #44) — generic 4-step wizard chassis (X-4 LOCKED).
//
// Drives any LaneWizardConfig through Step 1+2 (lane-supplied) → Step 3
// preflight (auto-fires `usePolicyPreflight` on entry; bro can re-run
// or open `<PolicyOverrideDialog>` to wave warnings) → Step 4 run
// (consumes `useWorkflowRun`, surfaces policy_blocked / policy_warned
// SSE events as inline banners, falls back to the override dialog when
// the runner blocks).
//
// Step 3/4 UI lives in sibling files under wizard/ to keep this chassis
// under the LOC hard cap.

import { useEffect, useMemo, useState } from "react"
import type { ReactElement } from "react"

import { PolicyOverrideDialog } from "@/client/components/PolicyOverrideDialog"
import {
  usePolicyPreflight,
  type PolicyDecision,
  type PolicyOverride,
  type PolicyViolation,
} from "@/client/api/policy-rules-hooks"
import { useProfilesList } from "@/client/api/profile-hooks"
import { PreflightStep } from "@/client/components/wizard/PreflightStep"
import { RunStep } from "@/client/components/wizard/RunStep"
import { useWorkflowRun } from "@/client/utils/use-workflow-run"
import type { ShowToast } from "@/client/components/ToastHost"
import type { NavParams, Page } from "@/client/navigator"
import type {
  LaneWizardConfig,
  WizardFormState,
} from "@/client/lane-wizards/types"

export interface PolicyAwareWizardProps<S extends WizardFormState> {
  config: LaneWizardConfig<S>
  showToast: ShowToast
  onNav: (page: Page, params?: NavParams) => void
}

export function PolicyAwareWizard<S extends WizardFormState>({
  config,
  showToast,
  onNav,
}: PolicyAwareWizardProps<S>): ReactElement {
  const [formState, setFormState] = useState<S>(() => config.initialState())
  const [stepIdx, setStepIdx] = useState<number>(0)
  const [overrides, setOverrides] = useState<PolicyOverride[]>([])
  const [overrideDialogOpen, setOverrideDialogOpen] = useState<boolean>(false)

  const profilesQuery = useProfilesList(0)
  const profiles = profilesQuery.data?.profiles ?? []

  const preflight = usePolicyPreflight()
  const runHandle = useWorkflowRun({
    workflowId: config.workflowId,
    buildBody: () => {
      // Form state owns profileId (Step 1 picks it). Splice overrides +
      // force the lane's run body shape.
      const body = config.buildRunBody(formState, formState.profileId as string)
      const policyOverrides = overrides.length > 0 ? overrides : undefined
      return policyOverrides !== undefined
        ? { ...body, policyOverrides }
        : body
    },
    showToast,
    navigate: onNav,
  })

  const inputStepCount = config.inputSteps.length
  const preflightStepIdx = inputStepCount
  const runStepIdx = inputStepCount + 1
  const totalSteps = inputStepCount + 2

  const allSteps: { id: string; title: string }[] = [
    ...config.inputSteps.map((s) => ({ id: s.id, title: s.title })),
    { id: "preflight", title: "Policy preflight" },
    { id: "run", title: "Run" },
  ]

  // Q-45.D — preflight badge auto-fires on Step-3 entry. Re-fires
  // whenever overrides change so bro sees the override-cleared
  // decision before moving to Step 4.
  useEffect(() => {
    if (stepIdx !== preflightStepIdx) return
    const input = config.buildPreflightInput(formState)
    void preflight.submit({
      ...input,
      ...(overrides.length > 0 ? { overrides } : {}),
    })
    // Re-run only on stepIdx + overrides; including formState would
    // re-fire on every keystroke.
  }, [stepIdx, overrides])

  const decision: PolicyDecision | null = preflight.decision
  const blockingViolations = useMemo<PolicyViolation[]>(
    () => decision?.violations.filter((v) => v.severity === "block") ?? [],
    [decision],
  )
  const unresolvedWarnings = useMemo<PolicyViolation[]>(
    () =>
      decision?.violations.filter(
        (v) =>
          v.severity === "warning" && v.details?.["overridden"] !== true,
      ) ?? [],
    [decision],
  )
  const canRun =
    decision !== null &&
    decision.ok &&
    unresolvedWarnings.length === 0 &&
    blockingViolations.length === 0

  const currentInputStep = config.inputSteps[stepIdx]
  const validation = currentInputStep?.validate?.(formState) ?? null
  const canAdvance = stepIdx < inputStepCount ? validation === null : true

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">
          {config.laneLabel} wizard
        </h1>
        <button
          type="button"
          onClick={() => onNav("home")}
          className="text-xs text-slate-400 hover:text-slate-200"
          data-testid="wizard-back-home"
        >
          ← Home
        </button>
      </header>

      <ol
        className="flex items-center gap-2 text-xs text-slate-400"
        data-testid="wizard-step-indicator"
      >
        {allSteps.map((s, i) => (
          <li
            key={s.id}
            data-step-active={i === stepIdx ? "true" : "false"}
            className={
              i === stepIdx
                ? "rounded-full bg-indigo-500/20 px-2 py-1 text-indigo-200"
                : i < stepIdx
                  ? "rounded-full bg-slate-800 px-2 py-1 text-slate-300"
                  : "rounded-full px-2 py-1 text-slate-500"
            }
          >
            {i + 1}. {s.title}
          </li>
        ))}
      </ol>

      <section
        className="rounded-lg border border-slate-800 bg-slate-950/40 p-5"
        aria-label={allSteps[stepIdx]?.title ?? ""}
      >
        {currentInputStep
          ? currentInputStep.render({
              formState,
              setFormState,
              profiles,
              profilesLoading: profilesQuery.loading,
              profilesError: profilesQuery.error,
              showToast,
            })
          : null}

        {stepIdx === preflightStepIdx ? (
          <PreflightStep
            decision={decision}
            state={preflight.state}
            error={preflight.error}
            blocking={blockingViolations}
            unresolvedWarnings={unresolvedWarnings}
            onResolve={() => setOverrideDialogOpen(true)}
            onRecheck={() => {
              const input = config.buildPreflightInput(formState)
              void preflight.submit({
                ...input,
                ...(overrides.length > 0 ? { overrides } : {}),
              })
            }}
          />
        ) : null}

        {stepIdx === runStepIdx ? (
          <RunStep
            runState={runHandle.runState}
            policyEvent={runHandle.policyEvent}
            total={runHandle.total}
            completedCount={runHandle.completedCount}
            onStart={runHandle.start}
            onCancel={() => void runHandle.cancel()}
          />
        ) : null}
      </section>

      <nav className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStepIdx((n) => Math.max(0, n - 1))}
          disabled={stepIdx === 0 || runHandle.runState === "running"}
          className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
          data-testid="wizard-prev"
        >
          ← Back
        </button>
        <span className="text-xs text-slate-500" data-testid="wizard-validation">
          {stepIdx < inputStepCount && validation !== null ? validation : ""}
          {stepIdx === preflightStepIdx && !canRun && decision !== null
            ? "Resolve violations to continue."
            : ""}
        </span>
        <button
          type="button"
          onClick={() => setStepIdx((n) => Math.min(totalSteps - 1, n + 1))}
          disabled={
            !canAdvance ||
            stepIdx === totalSteps - 1 ||
            (stepIdx === preflightStepIdx && !canRun) ||
            runHandle.runState === "running"
          }
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          data-testid="wizard-next"
        >
          Next →
        </button>
      </nav>

      <PolicyOverrideDialog
        open={overrideDialogOpen}
        violations={decision?.violations ?? []}
        {...(typeof formState.profileId === "string"
          ? { decidedBy: formState.profileId }
          : {})}
        onConfirm={(out) => {
          setOverrides(out)
          setOverrideDialogOpen(false)
        }}
        onCancel={() => setOverrideDialogOpen(false)}
      />
    </main>
  )
}
