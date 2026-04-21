// Boot entry — single-user local tool. Bind 127.0.0.1 only (LAN exposure
// would leak keys). Open DB first so MigrationDriftError aborts startup
// before the HTTP listener binds.

import { serve } from "@hono/node-server"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { createLogger } from "@/core/shared/logger"
import { openAssetDatabase } from "@/server/asset-store/db"
import { createApp } from "./app"

const logger = createLogger()
const HOSTNAME = "127.0.0.1"
const PORT = 5174

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const pkgPath = join(here, "..", "..", "package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string }
  return pkg.version
}

function boot(): void {
  try {
    openAssetDatabase()
  } catch (err) {
    logger.error("database boot failed", {
      message: err instanceof Error ? err.message : String(err),
    })
    process.exit(1)
  }

  const version = readVersion()
  const app = createApp({ version })

  serve({ fetch: app.fetch, hostname: HOSTNAME, port: PORT }, (info) => {
    logger.info("server listening", {
      hostname: info.address,
      port: info.port,
      version,
    })
  })
}

boot()
