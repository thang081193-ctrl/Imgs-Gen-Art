import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  // S#38 Q-38.B — `__GIT_SHA__` is injected at build time by vite.config.ts.
  // Tests never run through that pipeline, so we stub it here so component
  // tests that mount AppHeader don't blow up on a ReferenceError.
  define: {
    __GIT_SHA__: JSON.stringify("test"),
  },
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
    // S#38 — register @testing-library/jest-dom matchers globally so
    // jsdom component tests can use `toBeInTheDocument` / `toHaveAttribute`.
    // Cheap to load for non-DOM tests (just an expect.extend call).
    setupFiles: ["./tests/setup-dom-matchers.ts"],
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
  // S#38 — vitest uses esbuild for transforms. tsconfig.client.json sets
  // `jsx: "react-jsx"` so client source skips `import React`; mirror that
  // here so component tests' JSX compiles to the automatic runtime
  // instead of throwing `ReferenceError: React is not defined`.
  esbuild: {
    jsx: "automatic",
  },
})
