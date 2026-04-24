// Typed fetch wrapper. Matches server error shape { code, message, details? }
// from src/server/middleware/error-handler.ts. Throws ApiError on non-2xx.
// Returns parsed JSON body on success. AbortSignal supported for Phase 3 SSE.

export interface ApiErrorPayload {
  code: string
  message: string
  details?: Record<string, unknown>
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message)
    this.name = "ApiError"
    this.code = payload.code
    this.status = status
    if (payload.details !== undefined) this.details = payload.details
  }
}

export interface ApiOptions {
  signal?: AbortSignal
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const contentType = res.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")

  if (!res.ok) {
    if (isJson) {
      const payload = (await res.json()) as ApiErrorPayload
      throw new ApiError(res.status, payload)
    }
    throw new ApiError(res.status, {
      code: "HTTP_ERROR",
      message: `HTTP ${res.status} ${res.statusText}`,
    })
  }

  if (!isJson) {
    throw new Error(`Expected JSON response, got Content-Type: ${contentType}`)
  }
  return (await res.json()) as T
}

export function apiGet<T>(path: string, opts?: ApiOptions): Promise<T> {
  return request<T>(path, {
    method: "GET",
    headers: { Accept: "application/json" },
    ...(opts?.signal ? { signal: opts.signal } : {}),
  })
}

export function apiPost<T>(path: string, body: unknown, opts?: ApiOptions): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(opts?.signal ? { signal: opts.signal } : {}),
  })
}

export function apiPut<T>(path: string, body: unknown, opts?: ApiOptions): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(opts?.signal ? { signal: opts.signal } : {}),
  })
}

export function apiPostMultipart<T>(
  path: string,
  formData: FormData,
  opts?: ApiOptions,
): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: formData,
    ...(opts?.signal ? { signal: opts.signal } : {}),
  })
}

export async function apiDelete<T>(path: string, opts?: ApiOptions): Promise<T | null> {
  const res = await fetch(path, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    ...(opts?.signal ? { signal: opts.signal } : {}),
  })
  if (res.status === 204) return null
  const contentType = res.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")
  if (!res.ok) {
    if (isJson) {
      const payload = (await res.json()) as ApiErrorPayload
      throw new ApiError(res.status, payload)
    }
    throw new ApiError(res.status, {
      code: "HTTP_ERROR",
      message: `HTTP ${res.status} ${res.statusText}`,
    })
  }
  return isJson ? ((await res.json()) as T) : null
}
