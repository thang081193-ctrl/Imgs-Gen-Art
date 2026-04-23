// Vertex SA credential resolution.
// Split from vertex-imagen.ts to keep the adapter under the 300 LOC cap +
// let the Q1 (Session #19) `resolveServiceAccount` helper be unit-tested in
// isolation against fixture SA files + context overrides without pulling in
// the @google/genai SDK lazy-import.
//
// Priority mirrors Gemini's `resolveApiKey`:
//   1. context.serviceAccount (key-test endpoint — bypass active slot).
//   2. Active Vertex slot from encrypted store → read SA JSON from disk →
//      Zod-validate → return parsed credentials with slot-authoritative
//      projectId + location.
// Throws typed errors (NoActiveKeyError / ServiceAccountFileMissingError /
// ProviderError) so callers can surface distinct UX instead of opaque SDK
// crashes.

import { readFileSync } from "node:fs"
import { PROVIDER_IDS } from "@/core/model-registry/providers"
import type {
  HealthCheckContext,
  VertexServiceAccount,
} from "@/core/providers/types"
import {
  VertexServiceAccountSchema,
  type VertexServiceAccountJson,
} from "@/core/schemas/vertex-service-account"
import {
  NoActiveKeyError,
  ProviderError,
  ServiceAccountFileMissingError,
} from "@/core/shared/errors"
import { loadStoredKeys } from "@/server/keys/store"

export const DEFAULT_LOCATION = "us-central1"

export interface ResolvedServiceAccount {
  credentials: VertexServiceAccount
  projectId: string
  location: string
}

export function resolveServiceAccount(
  context?: HealthCheckContext,
): ResolvedServiceAccount {
  if (context?.serviceAccount) {
    const credentials = context.serviceAccount
    const projectId = String(credentials["project_id"] ?? "")
    if (!projectId) {
      throw new ProviderError(
        "Vertex service-account context missing project_id",
        { providerId: "vertex", sdkCode: "BAD_SA_CONTEXT" },
      )
    }
    return { credentials, projectId, location: DEFAULT_LOCATION }
  }

  const store = loadStoredKeys()
  const activeId = store.vertex.activeSlotId
  if (!activeId) {
    throw new NoActiveKeyError(
      "No active Vertex key slot configured — add a key via Settings.",
      { providerId: PROVIDER_IDS.VERTEX },
    )
  }
  const slot = store.vertex.slots.find((s) => s.id === activeId)
  if (!slot) {
    throw new NoActiveKeyError(
      "Active Vertex slot references a non-existent record — re-add the key.",
      { providerId: PROVIDER_IDS.VERTEX, slotId: activeId },
    )
  }

  let fileContent: string
  try {
    fileContent = readFileSync(slot.serviceAccountPath, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ServiceAccountFileMissingError({
        slotId: slot.id,
        expectedPath: slot.serviceAccountPath,
      })
    }
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fileContent)
  } catch {
    throw new ProviderError("Vertex service-account file is not valid JSON", {
      providerId: "vertex",
      sdkCode: "SA_JSON_PARSE",
      slotId: slot.id,
    })
  }

  const result = VertexServiceAccountSchema.safeParse(parsed)
  if (!result.success) {
    throw new ProviderError(
      "Vertex service-account file failed schema validation",
      {
        providerId: "vertex",
        sdkCode: "SA_SCHEMA_INVALID",
        slotId: slot.id,
        zodIssues: result.error.issues.map((i) => i.message),
      },
    )
  }

  const credentials: VertexServiceAccount = result.data as VertexServiceAccountJson
  return {
    credentials,
    projectId: slot.projectId,
    location: slot.location || DEFAULT_LOCATION,
  }
}
