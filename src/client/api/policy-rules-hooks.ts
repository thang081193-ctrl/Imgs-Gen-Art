// Session #42 Phase C2 — client hooks for /api/policy-rules/*.
//
// Three hooks (S#42 + S#43):
//   - usePolicyRulesStatus()  — GET /status, returns {data, error,
//     loading, refetch}. `refetch()` is exposed (vs the stock useFetch
//     pattern in client/api/hooks.ts) so the banner can re-pull after
//     a successful rescrape without a parent-key bump.
//   - useRescrapePolicyRules() — state-machine hook mirroring
//     prompt-assist-hooks.ts (Q-40.I): submit() returns Promise +
//     drives state. Consumer renders inline spinner + toast + reset.
//   - usePolicyPreflight()    — Phase C3 (S#43). State-machine over
//     POST /preflight. Wizard preflight badge calls submit(input) →
//     PolicyDecision; on `ok=false` it raises the override dialog.
//     Mirrors useRescrapePolicyRules so consumers share one mental
//     model.

import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError, apiGet, apiPost } from "@/client/api/client"

export type PolicyPlatform = "meta" | "google-ads" | "play"

export interface PerPlatformStatus {
  platform: PolicyPlatform
  scrapedAt: string | null
  contentHash: string | null
  sourceUrl: string | null
}

export interface PolicyRulesStatus {
  lastScrapedAt: string | null
  daysSince: number | null
  stalenessThresholdDays: number
  isStale: boolean
  perPlatform: PerPlatformStatus[]
}

export interface PolicyRulesStatusHandle {
  data: PolicyRulesStatus | null
  error: Error | null
  loading: boolean
  refetch: () => void
}

export function usePolicyRulesStatus(): PolicyRulesStatusHandle {
  const [data, setData] = useState<PolicyRulesStatus | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const aborted = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    aborted.current = false
    setLoading(true)
    apiGet<PolicyRulesStatus>("/api/policy-rules/status", { signal: controller.signal })
      .then((d) => {
        if (controller.signal.aborted) return
        setData(d)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      })
    return () => {
      aborted.current = true
      controller.abort()
    }
  }, [tick])

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  return { data, error, loading, refetch }
}

export interface RescrapeFailure {
  platform: PolicyPlatform
  sourceUrl: string
  error: string
}

export interface RescrapeOk {
  platform: PolicyPlatform
  scrapedAt: string
  sourceUrl: string
  contentHash: string
  contentExcerpt: string
  changedFromPrev: boolean
}

export interface RescrapeResult {
  ok: RescrapeOk[]
  failed: RescrapeFailure[]
  lastScrapedAt: string | null
}

export type RescrapeState = "idle" | "submitting" | "done" | "error"

export interface RescrapeHandle {
  state: RescrapeState
  result: RescrapeResult | null
  error: Error | null
  submit: (platforms?: PolicyPlatform[]) => Promise<RescrapeResult>
  reset: () => void
}

export function useRescrapePolicyRules(): RescrapeHandle {
  const [state, setState] = useState<RescrapeState>("idle")
  const [result, setResult] = useState<RescrapeResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const submit = useCallback(
    async (platforms?: PolicyPlatform[]): Promise<RescrapeResult> => {
      setState("submitting")
      setResult(null)
      setError(null)
      try {
        const body = platforms && platforms.length > 0 ? { platforms } : {}
        const out = await apiPost<RescrapeResult>("/api/policy-rules/rescrape", body)
        setResult(out)
        setState("done")
        return out
      } catch (err) {
        const e =
          err instanceof ApiError
            ? new Error(err.message)
            : err instanceof Error
              ? err
              : new Error(String(err))
        setError(e)
        setState("error")
        throw e
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setState("idle")
    setResult(null)
    setError(null)
  }, [])

  return { state, result, error, submit, reset }
}

// Phase C3 (Session #43) — preflight hook.
//
// PolicyDecision shape mirrors `core/schemas/policy-decision.ts`. Kept
// inline (vs imported) so this client file stays free of server-side
// imports and bundles cleanly.

export type PolicySeverity = "warning" | "block"

export interface PolicyViolation {
  ruleId: string
  severity: PolicySeverity
  kind: string
  message: string
  details?: Record<string, unknown>
}

export interface PolicyOverride {
  ruleId: string
  reason: string
  decidedBy?: string
  decidedAt?: string
}

export interface PolicyDecision {
  decidedAt: string
  ruleSetVersion?: string
  ok: boolean
  violations: PolicyViolation[]
  overrides?: PolicyOverride[]
}

export interface PolicyPreflightInput {
  platform: PolicyPlatform
  prompt?: string
  copyTexts?: string[]
  assetWidth?: number
  assetHeight?: number
  assetFileSizeBytes?: number
  assetAspectRatio?: string
  overrides?: PolicyOverride[]
}

export type PreflightState = "idle" | "submitting" | "done" | "error"

export interface PreflightHandle {
  state: PreflightState
  decision: PolicyDecision | null
  error: Error | null
  submit: (input: PolicyPreflightInput) => Promise<PolicyDecision>
  reset: () => void
}

export function usePolicyPreflight(): PreflightHandle {
  const [state, setState] = useState<PreflightState>("idle")
  const [decision, setDecision] = useState<PolicyDecision | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const submit = useCallback(
    async (input: PolicyPreflightInput): Promise<PolicyDecision> => {
      setState("submitting")
      setDecision(null)
      setError(null)
      try {
        const out = await apiPost<PolicyDecision>(
          "/api/policy-rules/preflight",
          input,
        )
        setDecision(out)
        setState("done")
        return out
      } catch (err) {
        const e =
          err instanceof ApiError
            ? new Error(err.message)
            : err instanceof Error
              ? err
              : new Error(String(err))
        setError(e)
        setState("error")
        throw e
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setState("idle")
    setDecision(null)
    setError(null)
  }, [])

  return { state, decision, error, submit, reset }
}
