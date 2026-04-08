/**
 * dashboard-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised helpers for dashboard data:
 *   - MARKET_DISPLAY_ORDER   fixed business-priority market ordering
 *   - sortByDisplayOrder()   sort any array of objects with market.name
 *   - getDashboardIndexSnapshot()  five required hardwood index values
 */

import { prisma } from "@/lib/prisma"

// ── Market ordering ──────────────────────────────────────────────────────────

/**
 * Fixed business-priority display order for dashboard market cards.
 * Markets not in this list are appended afterward in alphabetical order.
 */
export const MARKET_DISPLAY_ORDER: readonly string[] = [
  "Korea",
  "Taiwan",
  "USA",
  "Japan",
  "UAE",
  "Pakistan",
  "Thailand",
  "New Zealand",
  "India",
  "Vietnam",
  "Malaysia",
]

/**
 * Sort an array of objects that carry a `market.name` field by
 * MARKET_DISPLAY_ORDER. Items not in the list sort to the end alphabetically.
 */
export function sortByDisplayOrder<T extends { market: { name: string } }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const ai = MARKET_DISPLAY_ORDER.indexOf(a.market.name)
    const bi = MARKET_DISPLAY_ORDER.indexOf(b.market.name)
    const aPos = ai === -1 ? Number.MAX_SAFE_INTEGER : ai
    const bPos = bi === -1 ? Number.MAX_SAFE_INTEGER : bi
    if (aPos !== bPos) return aPos - bPos
    return a.market.name.localeCompare(b.market.name)
  })
}

// ── Index snapshot ───────────────────────────────────────────────────────────

/**
 * Mapping from user-facing display name to the exact IndexDefinition.name
 * stored in the database.  Set dbName to null if the index does not yet
 * exist in the DB — it will appear as explicitly missing on the dashboard.
 *
 * DB names confirmed from prisma.indexDefinition as of 2026-04-08:
 *   PIX China, TTO China BHK, TTO North America BHK
 * Missing (not yet seeded): PIX Europe Hardwood, PIX USA Hardwood
 */
const REQUIRED_HARDWOOD_INDEXES: { display: string; dbName: string | null }[] = [
  { display: "PIX China Hardwood", dbName: "PIX China" },
  { display: "TTO China Hardwood", dbName: "TTO China BHK" },
  { display: "TTO USA Hardwood",   dbName: "TTO North America BHK" },
  { display: "RISI Europe HW",     dbName: "RISI Europe HW" },
  { display: "RISI USA HW",        dbName: "RISI USA HW" },
]

export type IndexSnapshotRow = {
  display: string
  /** Numeric value in USD/ADT, or null when no data exists. */
  value: number | null
  /** The month (YYYY-MM) the value belongs to, or null when no data. */
  month: string | null
  /** True when the value's month equals the dashboard's current month. */
  isCurrentMonth: boolean
}

/**
 * Returns a complete five-row snapshot for the required hardwood indexes.
 *
 * Selection rule:
 *   1. Exclude any value with source = "forecast" — forecast rows from TTO
 *      or similar importers must never appear as the primary snapshot value.
 *   2. From the remaining actual/observed values, take the latest by month.
 *   3. isCurrentMonth = true only when that latest month equals currentMonth.
 *   4. When no non-forecast value exists at all, return value = null so the
 *      UI renders an explicit missing indicator rather than silently omitting.
 *
 * This prevents future-dated TTO forecast rows (e.g. 2029-12) from surfacing
 * as the primary snapshot while actual observed data is absent or stale.
 */
export async function getDashboardIndexSnapshot(
  currentMonth: string
): Promise<IndexSnapshotRow[]> {
  const results: IndexSnapshotRow[] = []

  for (const req of REQUIRED_HARDWOOD_INDEXES) {
    if (!req.dbName) {
      results.push({ display: req.display, value: null, month: null, isCurrentMonth: false })
      continue
    }

    const def = await prisma.indexDefinition.findFirst({
      where: { name: req.dbName },
    })

    if (!def) {
      results.push({ display: req.display, value: null, month: null, isCurrentMonth: false })
      continue
    }

    // Exclude forecast rows — only use actual/observed values
    const latest = await prisma.indexValue.findFirst({
      where: { indexId: def.id, NOT: { source: "forecast" } },
      orderBy: { month: "desc" },
    })

    if (!latest) {
      results.push({ display: req.display, value: null, month: null, isCurrentMonth: false })
      continue
    }

    results.push({
      display: req.display,
      value: Number(latest.value),
      month: latest.month,
      isCurrentMonth: latest.month === currentMonth,
    })
  }

  return results
}
