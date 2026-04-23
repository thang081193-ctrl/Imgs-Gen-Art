export * from "./types"
export * from "./mock"
// Adapter singletons are re-exported explicitly to avoid name clashes on the
// `_resetClientCacheForTests` test-affordance both gemini + vertex-imagen
// define. Tests that need those helpers import the specific module path.
export { geminiProvider } from "./gemini"
export { vertexImagenProvider } from "./vertex-imagen"
export * from "./registry"
