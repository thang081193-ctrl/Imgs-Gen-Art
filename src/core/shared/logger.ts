// CONTRIBUTING Rule 9 — logger with built-in secret redaction.
// Universal module. Debug/info no-op unless LOG_LEVEL=debug (or explicit createLogger("debug")).
// Routing: debug/info → console.debug, warn → console.warn, error → console.error.
// Why distinct console.debug: console.warn is reserved for actual warnings; abusing it for
// info-level output makes the warn channel noisy and semantically wrong.

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const REDACT_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /AIza[\w-]{35}/g,                 replacement: "AIza***" },
  { pattern: /ya29\.[\w-]+/g,                  replacement: "ya29.***" },
  { pattern: /eyJ[\w-]+\.[\w-]+\.[\w-]+/g,     replacement: "eyJ***.***.***" },
]

export function redact(input: string): string {
  let out = input
  for (const { pattern, replacement } of REDACT_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redact(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v)
    }
    return out
  }
  return value
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

function formatLine(level: LogLevel, msg: string, fields?: Record<string, unknown>): string {
  const safeMsg = redact(msg)
  const safeFields = fields ? (redactDeep(fields) as Record<string, unknown>) : undefined
  const payload = safeFields ? { msg: safeMsg, ...safeFields } : { msg: safeMsg }
  return `[${level.toUpperCase()}] ${JSON.stringify(payload)}`
}

function emit(level: LogLevel, minLevel: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return
  const line = formatLine(level, msg, fields)
  if (level === "error") {
    console.error(line)
  } else if (level === "warn") {
    console.warn(line)
  } else {
    // debug + info → console.debug (gated by minLevel already)
    console.debug(line)
  }
}

function resolveDefaultLevel(): LogLevel {
  const raw = globalThis.process?.env?.LOG_LEVEL
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw
  return "info"
}

export function createLogger(minLevel: LogLevel = resolveDefaultLevel()): Logger {
  return {
    debug: (m, f) => emit("debug", minLevel, m, f),
    info:  (m, f) => emit("info",  minLevel, m, f),
    warn:  (m, f) => emit("warn",  minLevel, m, f),
    error: (m, f) => emit("error", minLevel, m, f),
  }
}

export const logger: Logger = createLogger()
