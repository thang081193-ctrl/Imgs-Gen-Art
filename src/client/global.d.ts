// S#38 Q-38.B — `__GIT_SHA__` is a build-time constant injected by
// vite.config.ts via `define`. AppHeader's version strip reads it as
// a plain string. tsc doesn't see the Vite define, so this ambient
// declaration keeps both client typecheck targets (tsconfig.client +
// vitest jsdom resolution) happy.

declare const __GIT_SHA__: string
