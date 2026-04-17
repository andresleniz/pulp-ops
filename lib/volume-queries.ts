/**
 * volume-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared helper for volume chart data across all markets.
 *
 * SOURCE RULE
 *   Always CRM-only (source = "CRM"). The Japan pricing exception does NOT
 *   apply to volume — see price-queries.ts for the Japan pricing contract.
 *
 * USAGE
 *   import { getVolumeChartData } from "@/lib/volume-queries"
 *   const volumeChartByFiber = await getVolumeChartData({ marketId, months })
 */

import { prisma } from "@/lib/prisma"
import { CRM_FILTER } from "@/lib/order-queries"

export interface VolumeChartSeries {
  /** recharts-ready data points: { month, [customerName]: number | null, Total: number | null } */
  data: Record<string, string | number | null>[]
  /** Customer names in this series, in appearance order. "Total" is not included here. */
  customers: string[]
}

/**
 * Returns per-fiber volume chart data for a market over the given months.
 *
 * Each fiber produces one VolumeChartSeries with:
 *   - one key per customer (volume in ADT, null when absent that month)
 *   - one "Total" key (sum of all customers, null when zero)
 *
 * Months must be YYYY-MM strings. The returned data points use the short form
 * (YY-MM) in the `month` key to match XAxis expectations.
 */
export async function getVolumeChartData(params: {
  marketId: string
  months: string[]
}): Promise<Record<string, VolumeChartSeries>> {
  const { marketId, months } = params

  const orderRecords = await prisma.orderRecord.findMany({
    where: { ...CRM_FILTER, cycle: { marketId, month: { in: months } } },
    include: { fiber: true, customer: true, cycle: true },
  })

  const fiberCodes = [...new Set(orderRecords.map((o) => o.fiber.code))]
  const result: Record<string, VolumeChartSeries> = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = orderRecords.filter((o) => o.fiber.code === fiberCode)
    const customerNames = [...new Set(fiberOrders.map((o) => o.customer.name))]

    // Accumulate volume per month per customer
    const monthMap: Record<string, Record<string, number>> = {}
    for (const m of months) {
      monthMap[m] = {}
      for (const name of customerNames) monthMap[m][name] = 0
    }
    for (const order of fiberOrders) {
      const name = order.customer.name
      const month = order.cycle.month
      if (monthMap[month]) {
        monthMap[month][name] = (monthMap[month][name] ?? 0) + Number(order.volume)
      }
    }

    result[fiberCode] = {
      data: months.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        let total = 0
        for (const name of customerNames) {
          const vol = monthMap[m]?.[name] || null
          point[name] = vol
          total += vol ?? 0
        }
        point["Total"] = total > 0 ? total : null
        return point
      }),
      customers: customerNames,
    }
  }

  return result
}

// ── Europe country-level volume + weighted price ──────────────────────────────

/**
 * One aggregated data point for the Europe country chart.
 * Covers a single (country, month, fiber) combination.
 */
export interface EuropeCountryPoint {
  country: string
  /** YYYY-MM */
  month: string
  /** Total ADT for this country/month/fiber. */
  volume: number
  /**
   * Volume-weighted average price: sum(price * volume) / sum(volume).
   * null only when volume is 0 (defensive — imported orders always have price > 0).
   */
  weightedPrice: number | null
}

/**
 * Return value of getEuropeCountryLevelSeries().
 * Contains both the VolumeChart-compatible series and the flat price data points.
 */
export interface EuropeSeriesResult {
  /** Per-fiber volume series (country as series keys) — passed directly to VolumeChart. */
  volumeSeriesByFiber: Record<string, VolumeChartSeries>
  /** Per-fiber flat data points with volume + weighted price, one entry per country/month. */
  pointsByFiber: Record<string, EuropeCountryPoint[]>
  /** Sorted list of all country names present in the data. Empty when no country data exists. */
  countries: string[]
}

const EMPTY_EUROPE_SERIES: EuropeSeriesResult = {
  volumeSeriesByFiber: {},
  pointsByFiber: {},
  countries: [],
}
export { EMPTY_EUROPE_SERIES }

/**
 * Returns per-fiber volume and weighted-price data for the Europe market,
 * grouped by country instead of customer.
 *
 * Uses `OrderRecord.country` which is populated by the CRM importer for Europe
 * orders.  Orders with country=null (imported before the country field was added)
 * are excluded — returns EMPTY_EUROPE_SERIES until a re-import is run.
 *
 * Weighted price formula: sum(price × volume) / sum(volume) per country/month/fiber.
 * Rows with zero volume are skipped to avoid divide-by-zero.
 */
export async function getEuropeCountryLevelSeries(params: {
  marketId: string
  months: string[]
}): Promise<EuropeSeriesResult> {
  const { marketId, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: {
      ...CRM_FILTER,
      country: { not: null },
      cycle: { marketId, month: { in: months } },
    },
    select: {
      country: true,
      volume: true,
      price: true,
      fiber: { select: { code: true } },
      cycle: { select: { month: true } },
    },
  })

  if (orders.length === 0) return EMPTY_EUROPE_SERIES

  const allCountries = [...new Set(orders.map((o) => o.country as string))].sort()
  const fiberCodes = [...new Set(orders.map((o) => o.fiber.code))]
  const volumeSeriesByFiber: Record<string, VolumeChartSeries> = {}
  const pointsByFiber: Record<string, EuropeCountryPoint[]> = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = orders.filter((o) => o.fiber.code === fiberCode)
    const fiberCountries = [...new Set(fiberOrders.map((o) => o.country as string))].sort()

    // Accumulate volume and price×volume per (month, country)
    type Acc = { totalVol: number; totalVal: number }
    const acc: Record<string, Record<string, Acc>> = {}
    for (const m of months) {
      acc[m] = {}
      for (const c of fiberCountries) acc[m][c] = { totalVol: 0, totalVal: 0 }
    }
    for (const order of fiberOrders) {
      const country = order.country as string
      const month = order.cycle.month
      const vol = Number(order.volume)
      const price = Number(order.price)
      if (!acc[month]) acc[month] = {}
      if (!acc[month][country]) acc[month][country] = { totalVol: 0, totalVal: 0 }
      acc[month][country].totalVol += vol
      acc[month][country].totalVal += price * vol
    }

    // Build VolumeChartSeries for VolumeChart
    volumeSeriesByFiber[fiberCode] = {
      data: months.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        let total = 0
        for (const c of fiberCountries) {
          const vol = acc[m]?.[c]?.totalVol || null
          point[c] = vol
          total += vol ?? 0
        }
        point["Total"] = total > 0 ? total : null
        return point
      }),
      customers: fiberCountries,
    }

    // Build EuropeCountryPoint[] for price table
    const points: EuropeCountryPoint[] = []
    for (const m of months) {
      for (const c of fiberCountries) {
        const { totalVol, totalVal } = acc[m]?.[c] ?? { totalVol: 0, totalVal: 0 }
        if (totalVol === 0) continue
        points.push({
          country: c,
          month: m,
          volume: totalVol,
          weightedPrice: totalVol > 0 ? totalVal / totalVol : null,
        })
      }
    }
    pointsByFiber[fiberCode] = points
  }

  return { volumeSeriesByFiber, pointsByFiber, countries: allCountries }
}

export interface EuropeCountryDrilldownEntry {
  customer: string
  month: string
  volume: number
  price: number
}

/**
 * Returns per-country customer+month detail for the Europe market.
 * Used to power the drill-down table when a user expands a country row.
 *
 * Returns `Record<countryName, EuropeCountryDrilldownEntry[]>` sorted by
 * month desc, then customer asc.
 */
export async function getEuropeCountryDrilldown(params: {
  marketId: string
  months?: string[]
}): Promise<Record<string, EuropeCountryDrilldownEntry[]>> {
  const { marketId, months } = params

  const cycleWhere: Record<string, unknown> = { marketId }
  if (months && months.length > 0) cycleWhere.month = { in: months }

  const orders = await prisma.orderRecord.findMany({
    where: {
      ...CRM_FILTER,
      country: { not: null },
      cycle: cycleWhere,
    },
    select: {
      country: true,
      volume: true,
      price: true,
      customer: { select: { name: true } },
      cycle: { select: { month: true } },
    },
    orderBy: [{ cycle: { month: "desc" } }, { customer: { name: "asc" } }],
  })

  const result: Record<string, EuropeCountryDrilldownEntry[]> = {}
  for (const order of orders) {
    const country = order.country as string
    if (!result[country]) result[country] = []
    result[country].push({
      customer: order.customer.name,
      month: order.cycle.month,
      volume: Number(order.volume),
      price: Number(order.price),
    })
  }
  return result
}

// ── Destination-port volume ──────────────────────────────────────────────────

export interface DestinationPortVolumeRow {
  destinationPort: string
  month: string
  volume: number
}

/**
 * Returns CRM volume grouped by destination port and month for a market.
 *
 * Rows are excluded when destinationPort is null or an empty string.
 * Port values are trimmed before grouping so leading/trailing whitespace
 * cannot produce duplicate buckets.
 * Returns an empty array when no valid destination port data exists.
 *
 * @param marketId  Target market id
 * @param months    Optional YYYY-MM list to restrict the window. When omitted,
 *                  all historical records for the market are included.
 */
export async function getMarketDestinationPortVolumes(params: {
  marketId: string
  months?: string[]
}): Promise<DestinationPortVolumeRow[]> {
  const { marketId, months } = params

  const cycleWhere: Record<string, unknown> = { marketId }
  if (months && months.length > 0) {
    cycleWhere.month = { in: months }
  }

  const records = await prisma.orderRecord.findMany({
    where: {
      ...CRM_FILTER,
      // Exclude null and empty-string ports at the DB level
      destinationPort: { not: null, notIn: [""] },
      cycle: cycleWhere,
    },
    select: {
      destinationPort: true,
      volume: true,
      cycle: { select: { month: true } },
    },
  })

  // Aggregate: sum volume per (trimmed destinationPort, month) pair.
  // The trim here is a defensive guard — values are already normalized at
  // import time, but this prevents whitespace-fragmented buckets if any
  // legacy or manually-inserted record slipped through.
  const map = new Map<string, number>()
  for (const r of records) {
    const port = r.destinationPort!.trim()
    if (!port) continue // skip anything that trims down to empty
    const key = `${port}|||${r.cycle.month}`
    map.set(key, (map.get(key) ?? 0) + Number(r.volume))
  }

  return [...map.entries()]
    .map(([key, volume]) => {
      const sep = key.indexOf("|||")
      return {
        destinationPort: key.slice(0, sep),
        month: key.slice(sep + 3),
        volume,
      }
    })
    .sort((a, b) => a.month.localeCompare(b.month) || a.destinationPort.localeCompare(b.destinationPort))
}
