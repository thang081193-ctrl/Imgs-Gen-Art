// ESLint 9 flat config — enforces CONTRIBUTING.md Rules 3, 4, 5
// Per-folder no-restricted-imports per DECISIONS.md D1 and CONTRIBUTING.md Rule 4.

import tsParser from "@typescript-eslint/parser"
import tsPlugin from "@typescript-eslint/eslint-plugin"

const SERVER_ONLY_PACKAGES = [
  "@google/genai",
  "@google-cloud/vertexai",
  "better-sqlite3",
]

const NODE_IO_MODULES = ["fs", "path", "node:fs", "node:path", "node:fs/promises"]

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "vendor/**",
      "Genart-1/**",
      "Genart-2/**",
      "Genart-3/**",
      "data/**",
      "keys/**",
      "scripts/**",
      "*.config.{ts,js}",
      "tailwind.config.ts",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Rule 4: src/core cannot import SDKs, Node I/O, or react
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...SERVER_ONLY_PACKAGES.map((name) => ({
              name,
              message: "SDKs are server-only; src/core is universal. Use @/server/providers.",
            })),
            ...NODE_IO_MODULES.map((name) => ({
              name,
              message: "Node I/O is banned in src/core; move to src/server.",
            })),
            {
              name: "react",
              message: "src/core cannot import React; keep universal.",
            },
          ],
          patterns: [
            {
              group: ["**/server/**"],
              message: "src/core must not reach into src/server.",
            },
          ],
        },
      ],
    },
  },
  // Rule 3 + 5: client cannot import SDKs, server code, or process.env
  {
    files: ["src/client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: SERVER_ONLY_PACKAGES.map((name) => ({
            name,
            message: "Client calls /api, never the SDK directly.",
          })),
          patterns: [
            {
              group: ["**/server/**", "@/server/**"],
              message: "Client must not import server code.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "process",
          message: "Client must not read process.env; query /api/providers instead.",
        },
      ],
    },
  },
  // Rule 4: workflow runners cannot import SDKs directly
  {
    files: ["src/workflows/**/runner.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...SERVER_ONLY_PACKAGES.map((name) => ({
              name,
              message: "Runners access providers via dispatcher-injected registry.",
            })),
            {
              name: "react",
              message: "Runners are pure async generators; no React.",
            },
          ],
        },
      ],
    },
  },
]
