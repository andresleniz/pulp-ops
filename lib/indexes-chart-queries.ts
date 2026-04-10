/**
 * indexes-chart-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised data layer for the regional historical index charts page.
 *
 * OWNERSHIP
 *   - getRegionalHistoricalCharts()  fetches observed series data for all
 *     three regions, bounded to a rolling 24-month window.
 *   - Region → series mapping is sourced directly from INDEX_REGION_CONFIG
 *     in lib/indexes-queries.ts.  No duplicate mapping exists here.
 *
 * DATA SCOPE
 *   Identical observed-data rules as the snapshot page:
 *   - Fastmarkets rows:    source = 'Fastmarkets'
 *   - TTO observed rows:   source IS NULL  (legacy, pre-stamp)
 *   - Forecast rows:       excluded entirely (never shown in historical chart)
 *   - Future-dated rows:   not included (window ends at latest observed)
 *
 * WINDOW LOGIC
 *   1. Find the latest non-forecast observation across all series in a region.
 *      This is the chart endpoint.
 *   2. Go back exactly 24 months from that endpoint's calendar month.
 *      This is the chart start date.
 *   3. Fetch every observed point for each series within [startDate, endpoint].
 *
 * RAW DATES PRESERVED
 *   Weekly series remain YYYY-MM-DD precision.
 *   Monthly series remain YYYY-MM precision.
 *   No resampling is applied.  Missing points are returned as absent (not null).
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
  /** Latest non-forecast observation date across all series in this region. */
  endpoint: string
  /** 24 calendar months before the endpoint month (YYYY-MM). */
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

// ── Main query ────────────────────────────────────────────────────────────────

/**
 * Returns 24-month observed chart data for all three regions.
 *
 * Uses INDEX_REGION_CONFIG as the single source of truth for which series
 * belong to each region.  Only `direct` mappings with a valid dbName are
 * included (unavailable cards are silently skipped — they have no data).
 */
export async function getRegionalHistoricalCharts(): Promise<RegionalChartData[]> {
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

    // Find the latest non-forecast observation across ALL series in this region
    const indexIds = [...defMap.values()]
    if (indexIds.length === 0) {
      results.push({ region: regionDef.region, endpoint: "", startDate: "", series: [] })
      continue
    }

    const latestRow = await prisma.indexValue.findFirst({
      where: {
        indexId: { in: indexIds },
        OR: [{ source: null }, { source: { not: "forecast" } }],
      },
      orderBy: { month: "desc" },
      select: { month: true },
    })

    if (!latestRow) {
      results.push({ region: regionDef.region, endpoint: "", startDate: "", series: [] })
      continue
    }

    const endpoint = latestRow.month
    const startDate = subtractMonths(endpoint.slice(0, 7), 24)

    // Fetch each series within the 24-month window
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
          month: { gte: startDate },
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

    results.push({ region: regionDef.region, endpoint, startDate, series })
  }

  return results
}
