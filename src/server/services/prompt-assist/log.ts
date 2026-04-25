// Session #39 Phase B1 — JSONL log writer for prompt-assist calls.
//
// Q-39.E: dedicated file at data/logs/prompt-assist.jsonl, append-only, no
// PII. Schema captures latency + outcome + token usage so bro can audit
// cost / failure rate without server-log noise. Prompt body and image bytes
// NEVER touch this file. Provider name + use-case + outcome are the only
// classification fields.

import { mkdirSync, appendFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { UseCaseName } from "./types"

export type PromptAssistOutcome =
  | "ok"
  | "retry"
  | "timeout"
  | "error"
  | "fallback"

export interface PromptAssistLogEntry {
  ts: string
  provider: string
  model: string | null
  useCase: UseCaseName
  latencyMs: number
  inputTokens?: number
  outputTokens?: number
  outcome: PromptAssistOutcome
  error?: string
}

export const DEFAULT_LOG_PATH = resolve(
  process.cwd(),
  "data",
  "logs",
  "prompt-assist.jsonl",
)

let resolvedLogPath: string = DEFAULT_LOG_PATH
let dirEnsured = false

export function setLogPath(path: string): void {
  resolvedLogPath = path
  dirEnsured = false
}

export function resetLogPathForTests(): void {
  resolvedLogPath = DEFAULT_LOG_PATH
  dirEnsured = false
}

export function logPromptAssist(entry: PromptAssistLogEntry): void {
  if (!dirEnsured) {
    mkdirSync(dirname(resolvedLogPath), { recursive: true })
    dirEnsured = true
  }
  appendFileSync(resolvedLogPath, JSON.stringify(entry) + "\n", "utf8")
}
