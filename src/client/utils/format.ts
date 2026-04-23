// Number formatting helpers for client UI. Kept lightweight (no intl lib).
//
// formatCost: asset-level = $0.000 (3 decimals) to distinguish NB Pro
// $0.134 vs NB 2 $0.067 at-a-glance; aggregate = $0.00 (2 decimals) for
// batch totals. `$0` → "$0.00" short-circuit so Mock's free batches read
// cleanly. Negative input clamps to 0 (defensive — data shouldn't have it).

export type CostPrecision = "asset" | "aggregate"

export function formatCost(
  usd: number | null | undefined,
  precision: CostPrecision = "asset",
): string {
  if (usd === null || usd === undefined) return "—"
  const v = usd < 0 ? 0 : usd
  if (v === 0) return "$0.00"
  return precision === "aggregate" ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`
}
