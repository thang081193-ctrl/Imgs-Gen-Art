// Typed error classes. Server routes map these to HTTP status codes.

export type ErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "NOT_IMPLEMENTED"
  | "VERSION_CONFLICT"
  | "INCOMPATIBLE_WORKFLOW_PROVIDER"
  | "RUNTIME_VALIDATION_FAILED"
  | "NO_ACTIVE_KEY"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_ERROR"
  | "SAFETY_FILTER"
  | "NOT_REPLAYABLE"
  | "EDIT_REQUIRES_PROMPT"
  | "EDIT_FIELD_NOT_ALLOWED"
  | "CAPABILITY_NOT_SUPPORTED"
  | "LEGACY_PAYLOAD_NOT_EDITABLE"
  | "MALFORMED_PAYLOAD"
  | "EXTRACTION_FAILED"
  | "MIGRATION_DRIFT"
  | "INTERNAL"

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, message: string, status: number, details?: Record<string, unknown>) {
    super(message)
    this.name = "AppError"
    this.code = code
    this.status = status
    // exactOptionalPropertyTypes: keep `details` key absent when undefined
    // rather than present-as-undefined. JSON.stringify output is identical either
    // way, but this satisfies the strict-TS invariant for readers.
    if (details !== undefined) this.details = details
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("BAD_REQUEST", message, 400, details)
    this.name = "BadRequestError"
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("NOT_FOUND", message, 404, details)
    this.name = "NotFoundError"
  }
}

export class NotImplementedError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("NOT_IMPLEMENTED", message, 501, details)
    this.name = "NotImplementedError"
  }
}

export class VersionConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VERSION_CONFLICT", message, 409, details)
    this.name = "VersionConflictError"
  }
}

export class RuntimeValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("RUNTIME_VALIDATION_FAILED", message, 409, details)
    this.name = "RuntimeValidationError"
  }
}

export class IncompatibleWorkflowProviderError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("INCOMPATIBLE_WORKFLOW_PROVIDER", message, 409, details)
    this.name = "IncompatibleWorkflowProviderError"
  }
}

export class NoActiveKeyError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("NO_ACTIVE_KEY", message, 401, details)
    this.name = "NoActiveKeyError"
  }
}

export class ProviderUnavailableError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("PROVIDER_UNAVAILABLE", message, 410, details)
    this.name = "ProviderUnavailableError"
  }
}

export interface ProviderNotFoundContext {
  providerId: string
  availableProviders: string[]
}

export class ProviderNotFoundError extends AppError {
  constructor(context: ProviderNotFoundContext) {
    const available = context.availableProviders.map((id) => `'${id}'`).join(", ")
    super(
      "PROVIDER_NOT_FOUND",
      `Provider '${context.providerId}' not found. Available: [${available}]`,
      404,
      { ...context },
    )
    this.name = "ProviderNotFoundError"
  }
}

// Generic provider-adapter failure — SDK error, malformed response, network glitch.
// Maps 502 (Bad Gateway) because the root cause is the upstream provider service,
// not Images Gen Art's own logic. Details carry the minimum debug context:
// providerId + modelId + optional sdkCode so logs trace back to the exact call.
export interface ProviderErrorDetails {
  providerId: string
  modelId?: string
  sdkCode?: string
  [key: string]: unknown
}

export class ProviderError extends AppError {
  constructor(message: string, details: ProviderErrorDetails) {
    super("PROVIDER_ERROR", message, 502, details)
    this.name = "ProviderError"
  }
}

// Raised when a Gemini/Vertex response carries a content-safety block.
// Maps 422 (Unprocessable Entity) — the request itself was valid, the output
// was refused by the model's safety filter. Surfaces a distinct UI affordance
// ("prompt blocked, try rephrasing") instead of the generic "provider error".
export interface SafetyFilterDetails {
  providerId: string
  modelId?: string
  reason: string
  prompt?: string          // caller may truncate before passing in
  [key: string]: unknown
}

export class SafetyFilterError extends AppError {
  constructor(message: string, details: SafetyFilterDetails) {
    super("SAFETY_FILTER", message, 422, details)
    this.name = "SafetyFilterError"
  }
}

// Specialization of ProviderError for a known-preventable Vertex failure mode:
// the slot references an SA file that is no longer on disk (user deleted it,
// bad restore, etc.). Distinct class so the UI can surface "Service account
// file was deleted. Re-upload via Settings" instead of the generic 502.
// sdkCode pinned to "SA_FILE_MISSING" so callers can filter without string-matching
// the message. Still a 502 via the ProviderError base — the failure is
// operational upstream-auth, not a request-shape issue.
export interface ServiceAccountFileMissingDetails extends ProviderErrorDetails {
  slotId: string
  expectedPath: string
}

export class ServiceAccountFileMissingError extends ProviderError {
  constructor(details: Omit<ServiceAccountFileMissingDetails, "providerId" | "sdkCode">) {
    super(`Service account file missing for slot ${details.slotId}`, {
      providerId: "vertex",
      sdkCode: "SA_FILE_MISSING",
      slotId: details.slotId,
      expectedPath: details.expectedPath,
    })
    this.name = "ServiceAccountFileMissingError"
  }
}

// Session #27a — Phase 5 Step 5a (canonical payload migration + mode=edit).
// Emitted when POST /api/assets/:id/replay body.overridePayload contains a key
// outside the strict allowlist (prompt | addWatermark | negativePrompt). 400
// because the request shape itself is invalid; message carries the offending
// field name so the client can pinpoint without parsing Zod issues.
export class EditFieldNotAllowedError extends AppError {
  constructor(field: string) {
    super(
      "EDIT_FIELD_NOT_ALLOWED",
      `Field '${field}' cannot be edited. Allowed fields: prompt, addWatermark, negativePrompt.`,
      400,
      { field },
    )
    this.name = "EditFieldNotAllowedError"
  }
}

// Emitted when an allowlisted override field targets a model that lacks the
// capability (e.g. negativePrompt on Imagen 4). Distinct from
// EDIT_FIELD_NOT_ALLOWED: the field is generally editable, just not for this
// model. 400 because it's a client-correctable mismatch.
export class CapabilityNotSupportedError extends AppError {
  constructor(field: string, modelId: string) {
    super(
      "CAPABILITY_NOT_SUPPORTED",
      `Field '${field}' not supported by model '${modelId}'.`,
      400,
      { field, modelId },
    )
    this.name = "CapabilityNotSupportedError"
  }
}

// Emitted when mode=edit targets an asset whose replay_payload is the
// pre-Session-#27 legacy shape (promptRaw + primitives, no contextSnapshot).
// Replay is still supported for these assets via the dual-reader fallback;
// edit is not, because synthesizing a profileSnapshot from the current
// profile would silently drift from the batch-time profile — data corruption
// via optimism. User must create a fresh batch to edit.
export class LegacyPayloadNotEditableError extends AppError {
  constructor(assetId: string) {
    super(
      "LEGACY_PAYLOAD_NOT_EDITABLE",
      "This asset predates the edit & replay feature. Replay is supported but editing is not available. Create a new batch to use edit & replay.",
      400,
      { assetId },
    )
    this.name = "LegacyPayloadNotEditableError"
  }
}

// Emitted when a stored replay_payload matches neither the canonical nor the
// legacy schema. 500 because this is a data-corruption signal, not a client
// shape issue — a pre-migration row has been corrupted or a future-schema row
// has landed in a backend that hasn't caught up yet.
export class MalformedPayloadError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("MALFORMED_PAYLOAD", message, 500, details)
    this.name = "MalformedPayloadError"
  }
}

export class ExtractionError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("EXTRACTION_FAILED", message, 500, details)
    this.name = "ExtractionError"
  }
}

export interface MigrationDriftContext {
  filename: string
  expectedChecksum: string
  actualChecksum: string
}

export class MigrationDriftError extends AppError {
  constructor(context: MigrationDriftContext) {
    super(
      "MIGRATION_DRIFT",
      `Migration '${context.filename}' checksum mismatch — applied file was edited after commit. Expected ${context.expectedChecksum.slice(0, 12)}…, got ${context.actualChecksum.slice(0, 12)}…`,
      500,
      { ...context },
    )
    this.name = "MigrationDriftError"
  }
}
