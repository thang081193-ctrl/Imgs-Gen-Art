// S#38 — vitest setup file. Registers @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveAttribute, …) on vitest's expect. Loaded
// for every test file (cheap), but only meaningful in jsdom-env tests.
import "@testing-library/jest-dom/vitest"
