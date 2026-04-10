/**
 * indexes-chart-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised data layer for the regional historical index charts page.
 *
 * OWNERSHIP
 *   - getRegionalHistoricalCharts(currentMonth)  fetches observed series data
 *     for all three regions, bounded to a fixed 24-month rolling window.
 *   - Region → series mapping is sourced directly from INDEX_REGION_CONFIG
 *     in lib/indexes-queries.ts.  No duplicate mapping exists here.
 *
 * DATA SCOPE
 *   Identical observed-data rules as the snapshot page:
 *   - Fastmarkets rows:    source = 'Fastmarkets'
 *   - TTO observed rows:   source IS NULL  (legacy, pre-stamp)
 *   - Forecast rows:       excluded entirely (never shown in historical chart)
 *   - Future-dated rows:   excluded (window ends at currentMonth)
 *
 * WINDOW LOGIC
 *   Fixed 24-month calendar window anchored to the caller-supplied currentMonth:
 *     startDate  = currentMonth − 24 calendar months  (e.g. 2024-04 for 2026-04)
 *     endpoint   = currentMonth                        (e.g. 2026-04)
 *   All three regions use the same window — no per-region shift.
 *   Series may have gaps inside the frame; they are returned as absent (not null).
 *
 * RAW DATES PRESERVED
 *   Weekly series remain YYYY-MM-DD precision.
 *   Monthly series remain YYYY-MM precision.
 *   No resampling is applied.
 */

import { prisma } from "@/lib/prisma"
import { INDEX_REGION_CONFIG } from "./indexes-queries"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChartPoint = {
  date: string   // YYYY-MM-DD (weekly) or YYYY-MM (monthly) as stored
  value: number
}

export type ChartSeriesData = {
  label: string
  dbName: string
  points: ChartPoint[]
  hasData: boolean
}

export type RegionalChartData = {
  region: string
  /** Calendar month anchor supplied by the caller (YYYY-MM). */
  endpoint: string
  /** 24 calendar months before the endpoint (YYYY-MM). */
  startDate: string
  series: ChartSeriesData[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function observedWhere(indexId: string) {
  return {
    indexId,
    OR: [{ source: null }, { source: { not: "forecast" } }],
  }
}

/**
 * Subtract n calendar months from a YYYY-MM string.
 * e.g. subtractMonths("2026-04", 24) → "2024-04"
 */
function subtractMonths(yyyyMM: string, n: number): string {
  const [y, m] = yyyyMM.split("-").map(Number)
  const total = y * 12 + (m - 1) - n   // 0-indexed total months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, "0")}`
}

/** YYYY-MM → the first day of the following month (YYYY-MM) */
function nextMonthStr(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

// ── Main query ────────────────────────────────────────────────────────────────

/**
 * Returns 24-month observed chart data for all three regions.
 *
 * The window is fixed: [currentMonth − 24 months, currentMonth].
 * All three regions use the same window regardless of data availability.
 *
 * @param currentMonth  YYYY-MM string — today's calendar month.
 */
export async function getRegionalHistoricalCharts(
  currentMonth: string
): Promise<RegionalChartData[]> {
  const startDate  = subtractMonths(currentMonth, 24)
  const upperBound = nextMonthStr(currentMonth)   // exclusive upper bound for weekly keys
  const results: RegionalChartData[] = []

  for (const regionDef of INDEX_REGION_CONFIG) {
    // Only direct-mapped series — unavailable cards have no DB rows
    const directCards = regionDef.cards.filter(
      (c) => c.mappingType === "direct" && c.dbName != null
    )

    // Resolve IndexDefinition IDs for this region's series
    const defs = await prisma.indexDefinition.findMany({
      where: { name: { in: directCards.map((c) => c.dbName!) } },
      select: { id: true, name: true },
    })
    const defMap = new Map(defs.map((d) => [d.name, d.id]))

    // Fetch each series within the fixed 24-month window
    const series: ChartSeriesData[] = []
    for (const card of directCards) {
      const indexId = defMap.get(card.dbName!)
      if (!indexId) {
        series.push({ label: card.label, dbName: card.dbName!, points: [], hasData: false })
        continue
      }

      const rows = await prisma.indexValue.findMany({
        where: {
          ...observedWhere(indexId),
          month: { gte: startDate, lt: upperBound },
        },
        orderBy: { month: "asc" },
        select: { month: true, value: true },
      })

      series.push({
        label: card.label,
        dbName: card.dbName!,
        points: rows.map((r) => ({
          date: r.month,
          value: Math.round(Number(r.value) * 100) / 100,
        })),
        hasData: rows.length > 0,
      })
    }

    results.push({ region: regionDef.region, endpoint: currentMonth, startDate, series })
  }

  return results
}
