// React hooks for API calls. One-shot fetch on mount + AbortController
// cleanup. Phase 3 adds workflows / profiles / providers / compatibility /
// assets loaders used by Workflow + Gallery pages. Per-hook typing against
// server DTOs — no `any`.

import { useEffect, useState } from "react"
import type { ApiError } from "./client"
import { apiDelete, apiGet, apiPost, apiPostMultipart } from "./client"
import type { KeySlotDto, VertexSlotDto } from "@/core/dto/key-dto"
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

export function useAsset(assetId: string | null): ApiState<AssetDto> {
  return useFetch<AssetDto>(assetId !== null ? `/api/assets/${assetId}` : null)
}

// Session #20 — /api/keys CRUD + activate + test.
// `useKeys(refreshKey)` bumps on mutation to re-pull the list.
// Mutations throw ApiError on non-2xx; callers catch + surface via toast.

export interface KeysListResponse {
  gemini: { activeSlotId: string | null; slots: KeySlotDto[] }
  vertex: { activeSlotId: string | null; slots: VertexSlotDto[] }
}

export function useKeys(refreshKey: number = 0): ApiState<KeysListResponse> {
  return useFetch<KeysListResponse>(`/api/keys?_=${refreshKey}`)
}

export interface GeminiCreateInput {
  label: string
  key: string
}

export interface VertexCreateInput {
  label: string
  projectId: string
  location: string
  file: File
}

export interface SlotCreatedResponse {
  slotId: string
  provider: "gemini" | "vertex"
}

export interface SlotActivatedResponse {
  activated: true
  slotId: string
  provider: "gemini" | "vertex"
}

export interface SlotDeletedResponse {
  deleted: true
  deactivated: boolean
  slotId: string
  provider: "gemini" | "vertex"
  warning?: string
}

export interface SlotTestResponse {
  slotId: string
  modelId: string
  status: "ok" | "auth_error" | "rate_limited" | "quota_exceeded" | "down" | "unknown"
  latencyMs: number
  checkedAt: string
  message?: string
}

export function createGeminiKey(input: GeminiCreateInput): Promise<SlotCreatedResponse> {
  return apiPost<SlotCreatedResponse>("/api/keys", {
    provider: "gemini",
    label: input.label,
    key: input.key,
  })
}

export function createVertexKey(input: VertexCreateInput): Promise<SlotCreatedResponse> {
  const fd = new FormData()
  fd.append("label", input.label)
  fd.append("projectId", input.projectId)
  fd.append("location", input.location)
  fd.append("file", input.file, input.file.name)
  return apiPostMultipart<SlotCreatedResponse>("/api/keys", fd)
}

export function activateKey(slotId: string): Promise<SlotActivatedResponse> {
  return apiPost<SlotActivatedResponse>(`/api/keys/${slotId}/activate`, {})
}

export async function deleteKey(slotId: string): Promise<SlotDeletedResponse | null> {
  return apiDelete<SlotDeletedResponse>(`/api/keys/${slotId}`)
}

export function testKey(slotId: string): Promise<SlotTestResponse> {
  return apiPost<SlotTestResponse>(`/api/keys/${slotId}/test`, {})
}
