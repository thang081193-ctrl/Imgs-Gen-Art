// Session #39 Phase B1 — /api/prompt-assist routes.
//
// 3 endpoints exposing the prompt-assist use cases:
//   POST /reverse-from-image      multipart (image file + lane?, platform?, profileId?)
//   POST /idea-to-prompt          JSON
//   POST /text-overlay-brainstorm JSON (image as data:image base64)
//
// All return 200 with `PromptAssistResult` (prompt + optional notes/tokens
// + fromFallback). Errors map via the standard error-handler — invalid body
// → 400 BAD_REQUEST, oversized upload → 413 (Hono default).

import { Hono } from "hono"

import { BadRequestError } from "@/core/shared/errors"
import { validateBody } from "@/server/middleware/validator"
import {
  ideaToPrompt,
  reverseFromImage,
  textOverlayBrainstorm,
} from "@/server/services/prompt-assist"
import type {
  PromptAssistLane,
  ReverseFromImageInput,
  TextOverlayBrainstormInput,
} from "@/server/services/prompt-assist"
import {
  IdeaToPromptBodySchema,
  TextOverlayBodySchema,
  type IdeaToPromptBody,
  type TextOverlayBody,
} from "./prompt-assist.body"

type PromptAssistEnv = {
  Variables: { validatedBody: IdeaToPromptBody | TextOverlayBody }
}

const KNOWN_LANES: readonly PromptAssistLane[] = [
  "ads.meta",
  "ads.google-ads",
  "aso.play",
  "artwork-batch",
]

function asLane(raw: unknown): PromptAssistLane | undefined {
  if (typeof raw !== "string") return undefined
  return (KNOWN_LANES as readonly string[]).includes(raw) ? (raw as PromptAssistLane) : undefined
}

function decodeDataUrl(url: string): Buffer {
  const idx = url.indexOf(",")
  if (idx < 0) throw new BadRequestError("Invalid data URL")
  return Buffer.from(url.slice(idx + 1), "base64")
}

export function createPromptAssistRoute(): Hono<PromptAssistEnv> {
  const route = new Hono<PromptAssistEnv>()

  route.post("/reverse-from-image", async (c) => {
    const form = await c.req.formData().catch(() => null)
    if (!form) throw new BadRequestError("Expected multipart/form-data body")
    const file = form.get("image")
    if (!(file instanceof File)) {
      throw new BadRequestError("Missing 'image' file field")
    }
    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.byteLength === 0) {
      throw new BadRequestError("Empty image file")
    }

    const input: ReverseFromImageInput = { image: buf }
    const lane = asLane(form.get("lane"))
    if (lane) input.lane = lane
    const platform = form.get("platform")
    if (typeof platform === "string" && platform.trim()) input.platform = platform.trim()
    const profileId = form.get("profileId")
    if (typeof profileId === "string" && profileId.trim()) input.profileId = profileId.trim()

    const result = await reverseFromImage(input)
    return c.json(result)
  })

  route.post("/idea-to-prompt", validateBody(IdeaToPromptBodySchema), async (c) => {
    const body = c.get("validatedBody") as IdeaToPromptBody
    const result = await ideaToPrompt({
      idea: body.idea,
      lane: body.lane,
      ...(body.platform !== undefined ? { platform: body.platform } : {}),
      ...(body.profileId !== undefined ? { profileId: body.profileId } : {}),
    })
    return c.json(result)
  })

  route.post("/text-overlay-brainstorm", validateBody(TextOverlayBodySchema), async (c) => {
    const body = c.get("validatedBody") as TextOverlayBody
    const input: TextOverlayBrainstormInput = {}
    if (body.image) input.image = decodeDataUrl(body.image)
    if (body.description) input.description = body.description
    if (body.headline) input.headline = body.headline
    if (body.profileId) input.profileId = body.profileId

    const result = await textOverlayBrainstorm(input)
    return c.json(result)
  })

  return route
}
