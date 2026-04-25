// Workflow page — 4-card picker → form → Run → SSE stream → done.
// Delegates SSE / run-state / toast wiring to useWorkflowRun; this file
// owns only page-level selection state + composition.

import { useCallback, useEffect, useState } from "react"
import type { ReactElement } from "react"
import {
  useCompatibility,
  useProfile,
  useProfiles,
  useProviders,
  useWorkflows,
  lookupCompat,
} from "@/client/api/hooks"
import { useWorkflowRun } from "@/client/utils/use-workflow-run"
import { COLOR_CLASSES, type ColorVariant, type WorkflowId } from "@/core/design"
import type { AspectRatio, LanguageCode, ModelInfo } from "@/core/model-registry/types"
import type { ProfileDto } from "@/core/dto/profile-dto"
import { CompatibilityWarning } from "@/client/components/workflow/compatibility-warning"
import { ConfirmDialog } from "@/client/components/ConfirmDialog"
import { EventLog } from "@/client/components/EventLog"
import { ProfileSelector } from "@/client/components/ProfileSelector"
import { ProviderModelSelector } from "@/client/components/ProviderModelSelector"
import { RunStatusBar } from "@/client/components/RunStatusBar"
import { TopLevelSelectors } from "@/client/components/TopLevelSelectors"
import { WorkflowPicker } from "@/client/components/WorkflowPicker"
import type { ShowToast } from "@/client/components/ToastHost"
import { RETIRED_WORKFLOW_IDS, WORKFLOW_FORMS } from "@/client/workflows"
import type { NavParams, Navigator, Page } from "@/client/navigator"

export interface WorkflowPageProps {
  navigator: Navigator
  showToast: ShowToast
}

export function Workflow({ navigator, showToast }: WorkflowPageProps): ReactElement {
  const workflowsQ = useWorkflows()
  const profilesQ = useProfiles()
  const providersQ = useProviders()
  const compatQ = useCompatibility()

  const [workflowId, setWorkflowId] = useState<WorkflowId | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [providerId, setProviderId] = useState<string>("mock")
  const [modelId, setModelId] = useState<string>("mock-fast")
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | null>("1:1")
  const [language, setLanguage] = useState<LanguageCode | null>(null)
  const [formInput, setFormInput] = useState<unknown | null>(null)
  const [formError, setFormError] = useState<string | undefined>(undefined)
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false)

  const profileQ = useProfile(profileId)
  // S#38 §6.3 — drop client-retired workflows from the picker even
  // though /api/workflows still returns them (server keeps the route
  // for backward-compat replay of legacy ASO assets in Gallery).
  const workflows = (workflowsQ.data?.workflows ?? []).filter(
    (w) => !RETIRED_WORKFLOW_IDS.includes(w.id),
  )
  const profiles = profilesQ.data?.profiles ?? []
  const providers = providersQ.data?.providers ?? []
  const models = providersQ.data?.models ?? []
  const matrix = compatQ.data?.matrix ?? null

  const selectedWorkflow = workflows.find((w) => w.id === workflowId) ?? null
  const colorVariant: ColorVariant = selectedWorkflow?.colorVariant ?? "indigo"
  const selectedModel = models.find((m) => m.id === modelId && m.providerId === providerId) ?? null
  const compat = workflowId !== null
    ? lookupCompat(matrix, workflowId, providerId, modelId)
    : null
  const compatibleOK = compat?.status === "compatible"

  const buildBody = useCallback((): unknown => ({
    profileId,
    providerId,
    modelId,
    aspectRatio,
    ...(language !== null ? { language } : {}),
    input: formInput,
  }), [profileId, providerId, modelId, aspectRatio, language, formInput])

  const run = useWorkflowRun({
    workflowId,
    buildBody,
    showToast,
    navigate: navigator.go,
  })

  const canRun = run.runState !== "running"
    && workflowId !== null
    && profileId !== null
    && providerId !== ""
    && modelId !== ""
    && aspectRatio !== null
    && selectedModel !== null
    && compatibleOK
    && formInput !== null

  const handleInputChange = useCallback((input: unknown | null, error?: string) => {
    setFormInput(input)
    setFormError(error)
  }, [])

  useEffect(() => {
    setFormInput(null)
    setFormError(undefined)
  }, [workflowId])

  const anyLoading = workflowsQ.loading || profilesQ.loading || providersQ.loading || compatQ.loading

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
        <p className="text-sm text-slate-400">Pick a workflow, fill inputs, stream a batch.</p>
      </header>

      {anyLoading && <p className="text-sm text-slate-500">Loading…</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">Workflow</h2>
        <WorkflowPicker workflows={workflows} selected={workflowId} onSelect={setWorkflowId} />
      </section>

      {workflowId !== null && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-300">Profile</h2>
            <ProfileSelector
              profiles={profiles} value={profileId} onChange={setProfileId}
              loading={profilesQ.loading} error={profilesQ.error}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-300">Provider + model</h2>
            <ProviderModelSelector
              providers={providers} models={models}
              providerId={providerId} modelId={modelId}
              workflowId={workflowId} matrix={matrix}
              onProviderChange={(p) => {
                setProviderId(p)
                const first = models.find((m) => m.providerId === p)
                setModelId(first?.id ?? "")
              }}
              onModelChange={setModelId}
            />
            {compat !== null && compat.status === "incompatible" && (
              <CompatibilityWarning reason={compat.reason} />
            )}
            <TopLevelSelectors
              model={selectedModel} aspectRatio={aspectRatio} language={language}
              onAspectRatioChange={setAspectRatio} onLanguageChange={setLanguage}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-300">
              {selectedWorkflow?.displayName} input
            </h2>
            {selectedModel !== null ? (
              <WorkflowFormSlot
                workflowId={workflowId}
                model={selectedModel}
                profile={profileQ.data}
                onInputChange={handleInputChange}
                onNav={navigator.go}
                showToast={showToast}
              />
            ) : (
              <p className="text-xs text-slate-500">Pick a provider + model first.</p>
            )}
            {formError !== undefined && <p className="text-xs text-yellow-400">{formError}</p>}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={run.start}
                disabled={!canRun}
                title={!canRun && compat?.status === "incompatible" ? compat.reason : undefined}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                  canRun ? COLOR_CLASSES[colorVariant].active : "bg-slate-700"
                }`}
              >
                {run.runState === "running" ? "Running…" : "Run"}
              </button>
              <RunStatusBadge state={run.runState} />
            </div>
            {run.runState === "running" && (
              <RunStatusBar
                colorVariant={colorVariant}
                completedCount={run.completedCount}
                total={run.total}
                onCancel={() => setConfirmOpen(true)}
              />
            )}
            {run.events.length > 0 && <EventLog events={run.events} />}
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Cancel batch?"
        danger
        confirmLabel="Cancel batch"
        cancelLabel="Keep running"
        body={
          <p>
            <strong>{run.completedCount}</strong>/<strong>{run.total || "?"}</strong> assets generated.{" "}
            <strong>{Math.max(0, (run.total || 0) - run.completedCount)}</strong> remaining will be skipped.
          </p>
        }
        onConfirm={() => { setConfirmOpen(false); void run.cancel() }}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  )
}

function RunStatusBadge({ state }: { state: "idle" | "running" | "complete" | "aborted" | "error" }): ReactElement | null {
  if (state === "complete") return <span className="text-xs text-green-400">✓ Completed</span>
  if (state === "aborted")  return <span className="text-xs text-yellow-400">⚠ Aborted</span>
  if (state === "error")    return <span className="text-xs text-red-400">✗ Error</span>
  return null
}

function WorkflowFormSlot({
  workflowId, model, profile, onInputChange, onNav, showToast,
}: {
  workflowId: WorkflowId
  model: ModelInfo
  profile: ProfileDto | null
  onInputChange: (input: unknown | null, error?: string) => void
  onNav: (p: Page, params?: NavParams) => void
  showToast: ShowToast
}): ReactElement {
  // S#38 §6.3 — WORKFLOW_FORMS is now Partial<Record<…>>; a missing
  // entry (e.g. retired aso-screenshots) means the picker should never
  // have surfaced it. Defensive null-check here surfaces a tidy notice
  // instead of crashing if the filter ever drifts.
  const descriptor = WORKFLOW_FORMS[workflowId]
  if (!descriptor) {
    return (
      <div className="rounded-md border border-amber-900/60 bg-amber-950/40 p-3 text-sm text-amber-300">
        Workflow <code>{workflowId}</code> đã được retire khỏi client. Asset cũ vẫn xem được trong Gallery.
      </div>
    )
  }
  const Form = descriptor.Component
  return (
    <Form
      model={model}
      profile={profile}
      onInputChange={onInputChange}
      onNav={onNav}
      showToast={showToast}
    />
  )
}
