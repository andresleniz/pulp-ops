export const CRM_SNAPSHOTS = ["CRM Import", "USA Sales Import"]

export type PriceSource = "crm" | "manual" | "formula"

export function getPriceSource(
  formulaSnapshot: string | null,
  isOverride: boolean
): PriceSource {
  if (isOverride || formulaSnapshot === "MANUAL_OVERRIDE") return "manual"
  if (formulaSnapshot && CRM_SNAPSHOTS.some((s) => formulaSnapshot.startsWith(s))) return "crm"
  if (formulaSnapshot) return "formula"
  return "manual"
}

/** Returns true if this price record was set by a human (not imported from CRM/USA). */
export function isManualPrice(formulaSnapshot: string | null, isOverride: boolean): boolean {
  return getPriceSource(formulaSnapshot, isOverride) === "manual"
}

/** Returns true if this price record came from a CRM or USA file import. */
export function isCRMPrice(formulaSnapshot: string | null): boolean {
  return CRM_SNAPSHOTS.some((s) => (formulaSnapshot ?? "").startsWith(s))
}
