// Barrel for src/server/workflows-runtime/ — server-side orchestration layer
// consumed by src/server/routes/workflows.ts (Step 4). Keeps routes thin per
// CONTRIBUTING Rule 15 (no orchestration in route handlers).

export {
  _resetAbortRegistryForTests,
  abortBatch,
  deregisterBatch,
  isBatchActive,
  registerBatch,
} from "./abort-registry"

export {
  checkPreconditions,
  type PreconditionDeps,
  type PreconditionParams,
  type PreconditionResult,
} from "./precondition-check"

export {
  dispatch,
  type DispatchDeps,
  type DispatchParams,
} from "./dispatcher"
