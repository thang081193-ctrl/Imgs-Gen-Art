// Universal design + workflow identity types.
// Kept separate from tokens.ts so consumers can import types without pulling the 50-string table.

export type ColorVariant =
  | "violet" | "blue" | "pink" | "emerald"       // workflow identity
  | "indigo" | "green" | "yellow" | "red" | "sky" | "slate"  // semantic

export const WORKFLOW_IDS = [
  "artwork-batch",
  "ad-production",
  "style-transform",
  "aso-screenshots",
] as const

export type WorkflowId = (typeof WORKFLOW_IDS)[number]

/** Narrow a raw DB string into the WorkflowId union. Throws on drift. */
export function asWorkflowId(raw: string): WorkflowId {
  if ((WORKFLOW_IDS as readonly string[]).includes(raw)) {
    return raw as WorkflowId
  }
  throw new Error(`asWorkflowId: unknown workflow_id '${raw}' (DB drift or stale schema)`)
}

export interface ColorVariantClasses {
  active: string
  inactive: string
  glow: string
  badge: string
  text: string
}
