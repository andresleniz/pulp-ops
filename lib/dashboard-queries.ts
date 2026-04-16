/**
 * dashboard-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised helpers for dashboard data:
 *   - MARKET_DISPLAY_ORDER   fixed business-priority market ordering
 *   - sortByDisplayOrder()   sort any array of objects with market.name
 *   - getDashboardIndexSnapshot()  five required hardwood index values
 *
 * IMPORTANT — the dashboard market grid queries MonthlyCycle directly.
 *   It must never be gated by any layout or widget configuration.
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
  "Turkey",
  "Europe",
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
  /**
   * The month key the value was stored under (YYYY-MM or YYYY-MM-DD for
   * weekly series), or null when no data.
   */
  month: string | null
  /** True when the value's month key falls within the dashboard's current month. */
  isCurrentMonth: boolean
}

/** Returns the first day of the month after `month` (YYYY-MM). */
function nextMonthStr(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, "0")}`
}

/**
 * Returns a complete five-row snapshot for the required hardwood indexes.
 *
 * Selection rule:
 *   1. Exclude any value with source = "forecast".
 *   2. Try to find an observed value whose month key falls within currentMonth:
 *        month >= currentMonth  AND  month < nextMonth
 *      This handles both YYYY-MM keys (monthly series) and YYYY-MM-DD keys
 *      (weekly/biweekly series stored at full date precision).
 *      Take the latest by month key within that range → isCurrentMonth = true.
 *   3. If no current-month value exists, fall back to the latest observed value
 *      overall → isCurrentMonth = false (stale indicator shown in UI).
 *   4. When no non-forecast value exists at all, return value = null.
 *
 * Future-dated values (e.g. TTO forecast rows at 2029-12) are excluded by rule 1.
 * Weekly observations outside the current month window are shown as stale (rule 3).
 */
export async function getDashboardIndexSnapshot(
  currentMonth: string
): Promise<IndexSnapshotRow[]> {
  const nextMonth = nextMonthStr(currentMonth)
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

    // Include rows where source IS NULL (legacy observed data) OR source is not 'forecast'.
    // NOT: { source: "forecast" } alone excludes NULL in PostgreSQL, hiding older TTO rows.
    const nonForecastWhere = {
      indexId: def.id,
      OR: [{ source: null }, { source: { not: "forecast" } }],
    }

    // Try current-month window first (handles both YYYY-MM and YYYY-MM-DD keys)
    const current = await prisma.indexValue.findFirst({
      where: {
        ...nonForecastWhere,
        month: { gte: currentMonth, lt: nextMonth },
      },
      orderBy: { month: "desc" },
    })

    if (current) {
      results.push({
        display: req.display,
        value: Number(current.value),
        month: current.month,
        isCurrentMonth: true,
      })
      continue
    }

    // Fallback: latest observed value regardless of month (shown as stale)
    const latest = await prisma.indexValue.findFirst({
      where: nonForecastWhere,
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
      isCurrentMonth: false,
    })
  }

  return results
}
