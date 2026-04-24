import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // tests/live runs against real external APIs (Gemini, Vertex). They
    // self-gate via `describe.skipIf(!HAS_KEY)` so running without creds
    // costs zero billable calls + zero flake — `regression:full` stays
    // hermetic. Invoke explicitly via `npm run test:live:*` when keys set.
    exclude: ["node_modules", "dist", "vendor"],
    reporters: ["default"],
    pool: "threads",
    // CF#27 — 5 integration tests share data/assets/chartlens/ cleanup dir;
    // under the default threads pool their afterEach rmSync calls race and
    // surface as intermittent ENOTEMPTY. Route these files to a forks pool
    // with singleFork so they serialize. Rest of suite stays on threads.
    poolMatchGlobs: [
      ["tests/integration/edit-and-run.test.ts", "forks"],
      ["tests/integration/replay-route.test.ts", "forks"],
      ["tests/integration/workflows-full.test.ts", "forks"],
      ["tests/integration/workflows-routes.test.ts", "forks"],
      ["tests/integration/workflows-cancel.test.ts", "forks"],
    ],
    poolOptions: {
      forks: { singleFork: true },
    },
    env: {
      LOG_LEVEL: "warn",
    },
  },
  resolve: {
    alias: {
      "@/core": path.resolve(__dirname, "src/core"),
      "@/server": path.resolve(__dirname, "src/server"),
      "@/client": path.resolve(__dirname, "src/client"),
      "@/workflows": path.resolve(__dirname, "src/workflows"),
    },
  },
})
