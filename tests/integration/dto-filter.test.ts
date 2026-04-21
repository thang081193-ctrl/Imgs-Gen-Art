// dto-filter middleware — mounts a poison route returning a banned key and
// verifies the scanner throws + errorHandler returns 500 INTERNAL with a
// descriptive path. Dev-mode only; production skip tested by toggling env.

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { dtoFilter } from "@/server/middleware/dto-filter"
import { errorHandler } from "@/server/middleware/error-handler"

function makePoisonApp(payload: unknown): Hono {
  const app = new Hono()
  app.use("*", dtoFilter)
  app.get("/leak", (c) => c.json(payload as Record<string, unknown>))
  app.onError(errorHandler)
  return app
}

describe("dto-filter — dev mode (NODE_ENV != production)", () => {
  const originalEnv = process.env["NODE_ENV"]
  beforeEach(() => { delete process.env["NODE_ENV"] })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env["NODE_ENV"]
    else process.env["NODE_ENV"] = originalEnv
  })

  it("catches top-level banned key (filePath) → 500 INTERNAL", async () => {
    const app = makePoisonApp({ id: "a1", filePath: "./data/assets/x.png" })
    const res = await app.fetch(new Request("http://127.0.0.1/leak"))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe("INTERNAL")
    expect(body.message).toContain("filePath")
  })

  it("catches snake_case file_path → 500", async () => {
    const app = makePoisonApp({ id: "a1", file_path: "/secret/x.png" })
    const res = await app.fetch(new Request("http://127.0.0.1/leak"))
    expect(res.status).toBe(500)
  })

  it("catches nested serviceAccountPath inside array → 500", async () => {
    const app = makePoisonApp({
      slots: [{ id: "s1", serviceAccountPath: "/k/sa.json" }],
    })
    const res = await app.fetch(new Request("http://127.0.0.1/leak"))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.message).toContain("serviceAccountPath")
  })

  it("catches keyEncrypted anywhere in tree → 500", async () => {
    const app = makePoisonApp({ data: { vault: { keyEncrypted: "xyz" } } })
    const res = await app.fetch(new Request("http://127.0.0.1/leak"))
    expect(res.status).toBe(500)
  })

  it("clean response passes through → 200", async () => {
    const app = makePoisonApp({ id: "a1", imageUrl: "/api/assets/a1/file" })
    const res = await app.fetch(new Request("http://127.0.0.1/leak"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe("a1")
  })
})

describe("dto-filter — production mode skip", () => {
  const originalEnv = process.env["NODE_ENV"]
  beforeEach(() => { process.env["NODE_ENV"] = "production" })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env["NODE_ENV"]
    else process.env["NODE_ENV"] = originalEnv
  })

  it("skips scan in production — banned keys pass through (perf optimization)", async () => {
    const app = makePoisonApp({ filePath: "/leaked/in/prod.png" })
    const res = await app.fetch(new Request("http://127.0.0.1/leak"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.filePath).toBe("/leaked/in/prod.png")
  })
})
