// React hooks for API calls. One-shot fetch on mount + AbortController
// cleanup. Phase 3 adds workflows / profiles / providers / compatibility /
// assets loaders used by Workflow + Gallery pages. Per-hook typing against
// server DTOs — no `any`.

import { useEffect, useState } from "react"
import type { ApiError } from "./client"
import { apiGet } from "./client"
import type { ProfileDto, ProfileSummaryDto } from "@/core/dto/profile-dto"
import type { AssetDto } from "@/core/dto/asset-dto"
import type {
  ModelInfo,
  ProviderInfo,
} from "@/core/model-registry/types"
import type {
  CompatibilityMatrix,
  CompatibilityResult,
  WorkflowRequirement,
  CompatibilityOverride,
} from "@/core/compatibility/types"
import type { ColorVariant, WorkflowId } from "@/core/design/types"

export interface HealthData {
  status: "ok"
  version: string
  uptimeMs: number
}

export interface ApiState<T> {
  data: T | null
  error: ApiError | Error | null
  loading: boolean
}

function useFetch<T>(path: string | null): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    error: null,
    loading: path !== null,
  })

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false })
      return undefined
    }
    const controller = new AbortController()
    setState({ data: null, error: null, loading: true })
    apiGet<T>(path, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setState({ data, error: null, loading: false })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err : new Error(String(err))
        setState({ data: null, error, loading: false })
      })
    return () => { controller.abort() }
  }, [path])

  return state
}

export function useApiHealth(): ApiState<HealthData> {
  return useFetch<HealthData>("/api/health")
}

export interface WorkflowSummary {
  id: WorkflowId
  displayName: string
  description: string
  colorVariant: ColorVariant
  requirement: WorkflowRequirement
  compatibilityOverrides: CompatibilityOverride[]
}

export function useWorkflows(): ApiState<{ workflows: WorkflowSummary[] }> {
  return useFetch("/api/workflows")
}

export function useProfiles(): ApiState<{ profiles: ProfileSummaryDto[] }> {
  return useFetch("/api/profiles")
}

export function useProfile(id: string | null): ApiState<ProfileDto> {
  return useFetch<ProfileDto>(id !== null ? `/api/profiles/${id}` : null)
}

export interface ProvidersBody {
  providers: ProviderInfo[]
  models: ModelInfo[]
  registeredProviderIds: string[]
}

export function useProviders(): ApiState<ProvidersBody> {
  return useFetch<ProvidersBody>("/api/providers")
}

export function useCompatibility(): ApiState<{ matrix: CompatibilityMatrix }> {
  return useFetch("/api/providers/compatibility")
}

export function compatKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`
}

export function lookupCompat(
  matrix: CompatibilityMatrix | null,
  workflowId: WorkflowId,
  providerId: string,
  modelId: string,
): CompatibilityResult | null {
  if (!matrix) return null
  return matrix[workflowId]?.[compatKey(providerId, modelId)] ?? null
}

export interface AssetsListResponse {
  assets: AssetDto[]
  limit: number
  offset: number
}

export interface AssetsFilter {
  profileId?: string
  workflowId?: WorkflowId
  batchId?: string
  limit?: number
  offset?: number
}

export function useAssets(filter: AssetsFilter, refreshKey: number = 0): ApiState<AssetsListResponse> {
  const qs = new URLSearchParams()
  if (filter.profileId)  qs.set("profileId",  filter.profileId)
  if (filter.workflowId) qs.set("workflowId", filter.workflowId)
  if (filter.batchId)    qs.set("batchId",    filter.batchId)
  qs.set("limit",  String(filter.limit  ?? 50))
  qs.set("offset", String(filter.offset ?? 0))
  // refreshKey in path so external triggers re-fetch; query-string dedupe OK.
  return useFetch<AssetsListResponse>(`/api/assets?${qs.toString()}&_=${refreshKey}`)
}
