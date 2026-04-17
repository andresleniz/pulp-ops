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
 */

import { prisma } from "@/lib/prisma"
import { CRM_FILTER } from "@/lib/order-queries"
import type { VolumeChartSeries } from "@/lib/volume-queries"

// ── Constants ────────────────────────────────────────────────────────────────

/** EUR → USD conversion rate applied at CRM import time for Europe orders. */
export const EUR_USD_RATE = 1.09

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
    where: { ...CRM_FILTER, country: { not: null }, cycle: cycleWhere },
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
    const price = Number(order.price)
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
 * Returns per-fiber volume chart series for a single Europe country.
 * Customers within the country are the chart series.
 */
export async function getEuropeCountryVolumeSeries(params: {
  marketId: string
  country: string
  months: string[]
}): Promise<Record<string, VolumeChartSeries>> {
  const { marketId, country, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: { ...CRM_FILTER, country, cycle: { marketId, month: { in: months } } },
    include: { fiber: true, customer: true, cycle: true },
  })

  const fiberCodes = [...new Set(orders.map((o) => o.fiber.code))]
  const result: Record<string, VolumeChartSeries> = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = orders.filter((o) => o.fiber.code === fiberCode)
    const customerNames = [...new Set(fiberOrders.map((o) => o.customer.name))]

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

export interface EuropeCountryPricePoint {
  month: string
  customer: string
  fiber: string
  volume: number
  /** USD/ADT — already normalized at import time */
  price: number
}

/**
 * Returns per-fiber price chart series AND flat order points for a single
 * Europe country.  Price per (customer, month) is the volume-weighted average
 * when multiple rows exist for the same combination.
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
    where: { ...CRM_FILTER, country, cycle: { marketId, month: { in: months } } },
    select: {
      volume: true,
      price: true,
      fiber: { select: { code: true } },
      customer: { select: { name: true } },
      cycle: { select: { month: true } },
    },
    orderBy: [{ cycle: { month: "desc" } }, { customer: { name: "asc" } }],
  })

  const fiberCodes = [...new Set(orders.map((o) => o.fiber.code))]
  const chartDataByFiber: Record<
    string,
    { data: Record<string, string | number | null>[]; customers: string[] }
  > = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = orders.filter((o) => o.fiber.code === fiberCode)
    const customerNames = [...new Set(fiberOrders.map((o) => o.customer.name))]

    // Accumulate vol+val per (month, customer) for weighted-avg price
    const monthMap: Record<string, Record<string, { vol: number; val: number }>> = {}
    for (const m of months) {
      monthMap[m] = {}
      for (const name of customerNames) monthMap[m][name] = { vol: 0, val: 0 }
    }
    for (const order of fiberOrders) {
      const name = order.customer.name
      const month = order.cycle.month
      const vol = Number(order.volume)
      const price = Number(order.price)
      if (monthMap[month]?.[name]) {
        monthMap[month][name].vol += vol
        monthMap[month][name].val += price * vol
      }
    }

    chartDataByFiber[fiberCode] = {
      data: months.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        for (const name of customerNames) {
          const { vol, val } = monthMap[m]?.[name] ?? { vol: 0, val: 0 }
          point[name] = vol > 0 ? val / vol : null
        }
        return point
      }),
      customers: customerNames,
    }
  }

  const allPoints: EuropeCountryPricePoint[] = orders.map((o) => ({
    month: o.cycle.month,
    customer: o.customer.name,
    fiber: o.fiber.code,
    volume: Number(o.volume),
    price: Number(o.price),
  }))

  return { chartDataByFiber, allPoints }
}
