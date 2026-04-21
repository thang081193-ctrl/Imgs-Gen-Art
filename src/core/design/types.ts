// Universal design + workflow identity types.
// Kept separate from tokens.ts so consumers can import types without pulling the 50-string table.

export type ColorVariant =
  | "violet" | "blue" | "pink" | "emerald"       // workflow identity
  | "indigo" | "green" | "yellow" | "red" | "sky" | "slate"  // semantic

export type WorkflowId =
  | "artwork-batch"
  | "ad-production"
  | "style-transform"
  | "aso-screenshots"

export interface ColorVariantClasses {
  active: string
  inactive: string
  glow: string
  badge: string
  text: string
}
