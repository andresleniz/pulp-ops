/**
 * europe-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised helpers for the Europe nested-dashboard flow.
 *
 *  /markets/europe              — country overview (getEuropeCountrySummaries)
 *  /markets/europe/[country]   — customer detail (getEuropeCountryVolumeSeries
 *                                                 getEuropeCountryPriceSeries)
 *
 * EUR → USD rate used at import time (crm-importer.ts).
 * All prices stored in the DB are already USD after a re-import.
 *
 * ── Europe price policy ──────────────────────────────────────────────────────
 * All Europe reports use NET prices only.  `OrderRecord.price` is the
 * authoritative net price for every Europe CRM order — the importer prefers
 * the dedicated "net price" column over the generic "price" column, and never
 * silently falls back to a list price.  Use `selectEuropeNetPrice()` in every
 * Europe query instead of reading `order.price` directly so the commitment is
 * explicit and auditable.
 */

import { prisma } from "@/lib/prisma"
import { CRM_FILTER } from "@/lib/order-queries"
import type { VolumeChartSeries } from "@/lib/volume-queries"

// ── Constants ────────────────────────────────────────────────────────────────

/** EUR → USD conversion rate applied at CRM import time for Europe orders. */
export const EUR_USD_RATE = 1.09

// ── Europe price selection rule ───────────────────────────────────────────────

/**
 * Returns the net price (USD/ADT) for a confirmed Europe net-price row.
 *
 * Every caller of this function must have already filtered the Prisma query with
 * `isNetPrice: true`.  That WHERE clause is what guarantees the price is a real
 * net price — this helper just reads the stored value cleanly.
 *
 * Do NOT call this on rows fetched without the `isNetPrice: true` filter.
 */
export function selectEuropeNetPrice(order: { price: { toString(): string } | number }): number {
  return Number(order.price)
}

// ── Country overview ─────────────────────────────────────────────────────────

export interface EuropeCountrySummary {
  country: string
  totalVolume: number
  /** Volume-weighted average price (USD/ADT). null only if no volume. */
  weightedPrice: number | null
  customerCount: number
  latestMonth: string
}

/**
 * Returns one summary row per country for the Europe market.
 * Sorted by total volume descending.
 *
 * @param months  Optional YYYY-MM list to restrict the window.
 *                When omitted, all historical records are included.
 */
export async function getEuropeCountrySummaries(params: {
  marketId: string
  months?: string[]
}): Promise<EuropeCountrySummary[]> {
  const { marketId, months } = params

  const cycleWhere: Record<string, unknown> = { marketId }
  if (months?.length) cycleWhere.month = { in: months }

  const orders = await prisma.orderRecord.findMany({
    where: { ...CRM_FILTER, isNetPrice: true, country: { not: null }, cycle: cycleWhere },
    select: {
      country: true,
      volume: true,
      price: true,
      customer: { select: { name: true } },
      cycle: { select: { month: true } },
    },
    orderBy: { cycle: { month: "desc" } },
  })

  type Acc = { totalVol: number; totalVal: number; customers: Set<string>; latestMonth: string }
  const map = new Map<string, Acc>()

  for (const order of orders) {
    const country = order.country as string
    const vol = Number(order.volume)
    const price = selectEuropeNetPrice(order)  // net price only
    if (!map.has(country)) {
      map.set(country, { totalVol: 0, totalVal: 0, customers: new Set(), latestMonth: order.cycle.month })
    }
    const s = map.get(country)!
    s.totalVol += vol
    s.totalVal += price * vol
    s.customers.add(order.customer.name)
    if (order.cycle.month > s.latestMonth) s.latestMonth = order.cycle.month
  }

  return [...map.entries()]
    .map(([country, { totalVol, totalVal, customers, latestMonth }]) => ({
      country,
      totalVolume: totalVol,
      weightedPrice: totalVol > 0 ? totalVal / totalVol : null,
      customerCount: customers.size,
      latestMonth,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume)
}

// ── Country detail ────────────────────────────────────────────────────────────

/**
 * Returns per-fiber volume chart series for a single Europe country,
 * grouped by Incoterm (not customer).
 *
 * Only rows with a non-null, non-empty incoterm are included in the chart.
 * Returns an empty object when no incoterm data exists for the country —
 * the country page shows an explicit empty-state message in that case.
 */
export async function getEuropeCountryVolumeSeries(params: {
  marketId: string
  country: string
  months: string[]
}): Promise<Record<string, VolumeChartSeries>> {
  const { marketId, country, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: {
      ...CRM_FILTER,
      isNetPrice: true,
      country,
      incoterm: { not: null, notIn: [""] },
      cycle: { marketId, month: { in: months } },
    },
    select: {
      incoterm: true,
      volume: true,
      fiber: { select: { code: true } },
      cycle: { select: { month: true } },
    },
  })

  const fiberCodes = [...new Set(orders.map((o) => o.fiber.code))]
  const result: Record<string, VolumeChartSeries> = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = orders.filter((o) => o.fiber.code === fiberCode)
    const incoterms = [...new Set(fiberOrders.map((o) => o.incoterm as string))].sort()

    const monthMap: Record<string, Record<string, number>> = {}
    for (const m of months) {
      monthMap[m] = {}
      for (const inc of incoterms) monthMap[m][inc] = 0
    }
    for (const order of fiberOrders) {
      const inc = order.incoterm as string
      const month = order.cycle.month
      if (monthMap[month]) {
        monthMap[month][inc] = (monthMap[month][inc] ?? 0) + Number(order.volume)
      }
    }

    result[fiberCode] = {
      data: months.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        let total = 0
        for (const inc of incoterms) {
          const vol = monthMap[m]?.[inc] || null
          point[inc] = vol
          total += vol ?? 0
        }
        point["Total"] = total > 0 ? total : null
        return point
      }),
      // VolumeChartSeries reuses the `customers` field as generic series labels
      customers: incoterms,
    }
  }

  return result
}

export interface EuropeCountryPricePoint {
  month: string
  customer: string
  /** Incoterm value, or null when the row predates the Incoterm column. */
  incoterm: string | null
  fiber: string
  volume: number
  /** USD/ADT — already normalized at import time */
  price: number
}

/**
 * Returns per-fiber net-price chart series AND flat order points for a single
 * Europe country.
 *
 * Chart series are grouped by Incoterm (not customer).
 *   - Rows with null/empty incoterm are excluded from chart series but included
 *     in allPoints (so they appear in the detail table with an "—" incoterm).
 *   - Weighted net price formula: sum(price × volume) / sum(volume) per
 *     (incoterm, month, fiber).
 *
 * allPoints includes every net-price row (with or without incoterm) for the
 * detail table — month, customer, incoterm, volume, net price.
 */
export async function getEuropeCountryPriceSeries(params: {
  marketId: string
  country: string
  months: string[]
}): Promise<{
  chartDataByFiber: Record<string, { data: Record<string, string | number | null>[]; customers: string[] }>
  allPoints: EuropeCountryPricePoint[]
}> {
  const { marketId, country, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: { ...CRM_FILTER, isNetPrice: true, country, cycle: { marketId, month: { in: months } } },
    select: {
      incoterm: true,
      volume: true,
      price: true,
      fiber: { select: { code: true } },
      customer: { select: { name: true } },
      cycle: { select: { month: true } },
    },
    orderBy: [{ cycle: { month: "desc" } }, { customer: { name: "asc" } }],
  })

  // Chart series: only rows with a real incoterm value
  const ordersWithIncoterm = orders.filter((o) => o.incoterm && o.incoterm.trim())
  const fiberCodes = [...new Set(ordersWithIncoterm.map((o) => o.fiber.code))]
  const chartDataByFiber: Record<
    string,
    { data: Record<string, string | number | null>[]; customers: string[] }
  > = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = ordersWithIncoterm.filter((o) => o.fiber.code === fiberCode)
    const incoterms = [...new Set(fiberOrders.map((o) => o.incoterm as string))].sort()

    // Accumulate vol+val per (month, incoterm) for weighted-avg net price
    const monthMap: Record<string, Record<string, { vol: number; val: number }>> = {}
    for (const m of months) {
      monthMap[m] = {}
      for (const inc of incoterms) monthMap[m][inc] = { vol: 0, val: 0 }
    }
    for (const order of fiberOrders) {
      const inc = order.incoterm as string
      const month = order.cycle.month
      const vol = Number(order.volume)
      const price = selectEuropeNetPrice(order)  // net price only
      if (!monthMap[month]) monthMap[month] = {}
      if (!monthMap[month][inc]) monthMap[month][inc] = { vol: 0, val: 0 }
      monthMap[month][inc].vol += vol
      monthMap[month][inc].val += price * vol
    }

    chartDataByFiber[fiberCode] = {
      data: months.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        for (const inc of incoterms) {
          const { vol, val } = monthMap[m]?.[inc] ?? { vol: 0, val: 0 }
          point[inc] = vol > 0 ? val / vol : null
        }
        return point
      }),
      customers: incoterms,
    }
  }

  // allPoints: every net-price row (with or without incoterm) for the detail table
  const allPoints: EuropeCountryPricePoint[] = orders.map((o) => ({
    month: o.cycle.month,
    customer: o.customer.name,
    incoterm: o.incoterm ?? null,
    fiber: o.fiber.code,
    volume: Number(o.volume),
    price: selectEuropeNetPrice(o),  // net price only
  }))

  return { chartDataByFiber, allPoints }
}
