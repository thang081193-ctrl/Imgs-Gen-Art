// React hooks for API calls. One-shot fetch on mount + AbortController
// cleanup. Phase 3 adds workflows / profiles / providers / compatibility /
// assets loaders used by Workflow + Gallery pages. Per-hook typing against
// server DTOs — no `any`.

import { useEffect, useState } from "react"
import type { ApiError } from "./client"
import { apiDelete, apiGet, apiPost, apiPostMultipart } from "./client"
import type { KeySlotDto, VertexSlotDto } from "@/core/dto/key-dto"
import type { ProfileDto, ProfileSummaryDto } from "@/core/dto/profile-dto"
import type { AssetDto, ReplayClass } from "@/core/dto/asset-dto"
import type { DatePreset, TagMatchMode } from "@/core/schemas/asset-list-filter"
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

// Session #29 Step 3b — expanded filter shape. Mirrors the wire contract
// (AssetListFilterSchema) so URL ↔ filter round-trip is identity. Each field
// is explicitly `T | undefined` (not just optional) so callers can spread an
// AssetListFilter and override with explicit `undefined` values under
// `exactOptionalPropertyTypes: true`. `replayClasses === []` is a distinct
// "match none" state (Q-29.E); `undefined` means absent/all-3-on.
export interface AssetsFilter {
  profileIds?: string[] | undefined
  workflowIds?: string[] | undefined
  tags?: string[] | undefined
  tagMatchMode?: TagMatchMode | undefined
  datePreset?: DatePreset | undefined
  providerIds?: string[] | undefined
  modelIds?: string[] | undefined
  replayClasses?: ReplayClass[] | undefined
  batchId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

// CSV param encoding — each value is percent-encoded individually, then
// joined with an un-encoded comma so `?tags=sunset,neon` stays human-readable
// in the browser address bar (Q-29.C). Tags cannot contain commas (the tag
// input uses `,` as a delimiter) so the round-trip is lossless.
function encodeCsvParam(key: string, values: string[]): string {
  return `${encodeURIComponent(key)}=${values.map(encodeURIComponent).join(",")}`
}

// Public so the Gallery URL-sync + integration tests can exercise the exact
// encoding `useAssets` uses. Returns a leading "" — append to "/api/assets?…".
export function buildAssetsQueryString(filter: AssetsFilter): string {
  const parts: string[] = []
  if (filter.profileIds   && filter.profileIds.length   > 0) parts.push(encodeCsvParam("profileIds",   filter.profileIds))
  if (filter.workflowIds  && filter.workflowIds.length  > 0) parts.push(encodeCsvParam("workflowIds",  filter.workflowIds))
  if (filter.tags         && filter.tags.length         > 0) parts.push(encodeCsvParam("tags",         filter.tags))
  if (filter.tagMatchMode) parts.push(`tagMatchMode=${filter.tagMatchMode}`)
  if (filter.datePreset && filter.datePreset !== "all") parts.push(`datePreset=${filter.datePreset}`)
  if (filter.providerIds && filter.providerIds.length > 0) parts.push(encodeCsvParam("providerIds", filter.providerIds))
  if (filter.modelIds    && filter.modelIds.length    > 0) parts.push(encodeCsvParam("modelIds",    filter.modelIds))
  if (filter.replayClasses !== undefined) {
    // `[]` → `replayClasses=` (present-but-empty, match-none semantics).
    parts.push(filter.replayClasses.length === 0
      ? "replayClasses="
      : encodeCsvParam("replayClasses", filter.replayClasses))
  }
  if (filter.batchId) parts.push(`batchId=${encodeURIComponent(filter.batchId)}`)
  parts.push(`limit=${filter.limit  ?? 50}`)
  parts.push(`offset=${filter.offset ?? 0}`)
  return parts.join("&")
}

export function useAssets(filter: AssetsFilter, refreshKey: number = 0): ApiState<AssetsListResponse> {
  const qs = buildAssetsQueryString(filter)
  // refreshKey used as a useFetch dependency suffix. Schema-strict validation
  // (Session #28a) rejects unknown query params, so we keep the cache-buster
  // off the URL and out of the server's parser. Instead, thread it through
  // the React dependency key by appending a URL-fragment sentinel the server
  // never sees (fragments don't traverse the network).
  return useFetch<AssetsListResponse>(`/api/assets?${qs}#r=${refreshKey}`)
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
