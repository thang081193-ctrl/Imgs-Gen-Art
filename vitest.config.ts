import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // tests/live runs against real external APIs (Gemini, Vertex). Excluded
    // from the default run so `regression:full` stays hermetic + CI-safe.
    // Invoke explicitly via `npm run test:live`.
    exclude: ["node_modules", "dist", "vendor", "tests/live/**"],
    reporters: ["default"],
    pool: "threads",
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
