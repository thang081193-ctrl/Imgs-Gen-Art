import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["node_modules", "dist", "vendor"],
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
