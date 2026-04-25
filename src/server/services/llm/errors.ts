// Session #39 Phase B1 — LLM-layer typed errors.
//
// Use cases catch LLMError* and degrade to fallback; the route layer never
// sees these directly (use cases swallow + return fromFallback:true).
// Kept distinct from AppError because they don't map to an HTTP status —
// they're internal signals between provider → use case.

export class LLMError extends Error {
  readonly providerName: string
  constructor(message: string, providerName: string) {
    super(message)
    this.name = "LLMError"
    this.providerName = providerName
  }
}

export class LLMUnavailableError extends LLMError {
  readonly reason: "missing-key" | "no-provider" | "http-error"
  readonly httpStatus?: number
  constructor(
    message: string,
    providerName: string,
    reason: "missing-key" | "no-provider" | "http-error",
    httpStatus?: number,
  ) {
    super(message, providerName)
    this.name = "LLMUnavailableError"
    this.reason = reason
    if (httpStatus !== undefined) this.httpStatus = httpStatus
  }
}

export class LLMTimeoutError extends LLMError {
  readonly timeoutMs: number
  constructor(providerName: string, timeoutMs: number) {
    super(`${providerName} call exceeded ${timeoutMs}ms`, providerName)
    this.name = "LLMTimeoutError"
    this.timeoutMs = timeoutMs
  }
}
