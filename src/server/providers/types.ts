// Server-side re-export of universal provider contracts.
// Canonical definitions live in @/core/providers/types. Server code may import from
// either path; prefer this shorter alias when inside src/server/**.

export type {
  GenerateParams,
  GenerateResult,
  HealthStatus,
  HealthStatusCode,
  ImageProvider,
} from "@/core/providers/types"
