import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { execSync } from "node:child_process"

// S#38 Q-38.B — inject git short SHA at build time so AppHeader's
// version strip can render `v{pkg} · #{git short SHA}`. Falls back to
// "dev" when the working tree isn't a git checkout (e.g. tarball
// install) so the UI never blanks out.
function readGitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return "dev"
  }
}

export default defineConfig({
  plugins: [react()],
  root: ".",
  define: {
    __GIT_SHA__: JSON.stringify(readGitShortSha()),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5174",
        changeOrigin: false,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      "@/core": path.resolve(__dirname, "src/core"),
      "@/client": path.resolve(__dirname, "src/client"),
      "@/workflows": path.resolve(__dirname, "src/workflows"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    sourcemap: true,
  },
})
