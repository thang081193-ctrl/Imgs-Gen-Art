// Zod schema for a parsed GCP service-account JSON (Vertex auth).
// Mirrors the `VertexServiceAccount` interface in @/core/providers/types but
// adds runtime validation — the adapter Zod-parses the file content before
// handing it to @google-cloud/vertexai, so malformed / wrong-type JSON on
// disk surfaces as a typed error (SafetyFilterError / ProviderError family)
// instead of an opaque SDK crash.
//
// `.passthrough()` keeps unknown fields (token_uri, auth_provider_x509_cert_url,
// etc.) intact so the SDK still sees Google's full shape. The required-field
// set is intentionally the Rule-11-sensitive core: anything the logger
// redactor might need to recognize (private_key), plus the two fields we
// cross-check against the slot (project_id) and display (client_email).

import { z } from "zod"

export const VertexServiceAccountSchema = z
  .object({
    type: z.literal("service_account"),
    project_id: z.string().min(1, "project_id is required"),
    private_key_id: z.string().min(1, "private_key_id is required"),
    private_key: z.string().min(1, "private_key is required"),
    client_email: z
      .string()
      .email("client_email must be a valid email address"),
    client_id: z.string().optional(),
  })
  .passthrough()

export type VertexServiceAccountJson = z.infer<typeof VertexServiceAccountSchema>
