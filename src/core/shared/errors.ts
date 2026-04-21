// Typed error classes. Server routes map these to HTTP status codes.

export type ErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INCOMPATIBLE_WORKFLOW_PROVIDER"
  | "RUNTIME_VALIDATION_FAILED"
  | "NO_ACTIVE_KEY"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_NOT_FOUND"
  | "NOT_REPLAYABLE"
  | "EDIT_REQUIRES_PROMPT"
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
    this.details = details
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
