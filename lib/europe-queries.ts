/**
 * europe-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised helpers for the Europe nested-dashboard flow.
 *
 *  /markets/europe                        — country overview (getEuropeCountrySummaries)
 *  /markets/europe/[country]             — country detail  (customer-first view + incoterm toggle)
 *  /markets/europe/[country]/[customer]  — customer drill-down (incoterm breakdown)
 *
 * Customer-based helpers (primary/commercial view):
 *   getEuropeCountryCustomerVolumeSeries
 *   getEuropeCountryCustomerPriceSeries
 *   getEuropeCountryCustomerSummaries
 *
 * Incoterm-based helpers (secondary/logistics view):
 *   getEuropeCountryIncotermVolumeSeries
 *   getEuropeCountryIncotermPriceSeries
 *   getEuropeCountryIncotermSummaries
 *
 * EUR → USD conversion happens at import time using the monthly rate entered by
 * the user in the CRM import form (stored in OrderRecord.fxRateUsed).
 * All prices stored in the DB are already USD — no FX lookup at query time.
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

/**
 * Maximum number of individual customer series shown in customer-view charts.
 * Customers beyond this rank are aggregated into a single "Others" series.
 * The full customer list is always preserved in summary tables — only charts are capped.
 */
export const EUROPE_CUSTOMER_CHART_CAP = 8

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

// ── Country detail — shared point type ───────────────────────────────────────

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

// ── Country detail — Customer view (primary/commercial) ───────────────────────

/**
 * Returns per-fiber volume chart series for a single Europe country,
 * grouped by Customer (primary commercial view).
 *
 * Customers are sorted by total volume descending within each fiber.
 * All isNetPrice=true rows are included regardless of incoterm presence.
 */
export async function getEuropeCountryCustomerVolumeSeries(params: {
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
      cycle: { marketId, month: { in: months } },
    },
    select: {
      volume: true,
      fiber: { select: { code: true } },
      customer: { select: { name: true } },
      cycle: { select: { month: true } },
    },
  })

  const fiberCodes = [...new Set(orders.map((o) => o.fiber.code))].sort()
  const result: Record<string, VolumeChartSeries> = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = orders.filter((o) => o.fiber.code === fiberCode)

    // Sort customers by total volume descending
    const customerVolMap = new Map<string, number>()
    for (const o of fiberOrders) {
      const cust = o.customer.name
      customerVolMap.set(cust, (customerVolMap.get(cust) ?? 0) + Number(o.volume))
    }
    const allCustomers = [...customerVolMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    // Cap chart series at EUROPE_CUSTOMER_CHART_CAP; remainder aggregated as "Others"
    const topCustomers = allCustomers.slice(0, EUROPE_CUSTOMER_CHART_CAP)
    const otherCustomers = allCustomers.slice(EUROPE_CUSTOMER_CHART_CAP)
    const hasOthers = otherCustomers.length > 0

    // Build monthMap for ALL customers so "Others" sum is accurate
    const monthMap: Record<string, Record<string, number>> = {}
    for (const m of months) {
      monthMap[m] = {}
      for (const cust of allCustomers) monthMap[m][cust] = 0
    }
    for (const order of fiberOrders) {
      const cust = order.customer.name
      const month = order.cycle.month
      if (monthMap[month]) {
        monthMap[month][cust] = (monthMap[month][cust] ?? 0) + Number(order.volume)
      }
    }

    result[fiberCode] = {
      data: months.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        let total = 0
        for (const cust of topCustomers) {
          const vol = monthMap[m]?.[cust] || null
          point[cust] = vol
          total += vol ?? 0
        }
        if (hasOthers) {
          let othersVol = 0
          for (const cust of otherCustomers) othersVol += monthMap[m]?.[cust] ?? 0
          point["Others"] = othersVol > 0 ? othersVol : null
          total += othersVol
        }
        point["Total"] = total > 0 ? total : null
        return point
      }),
      // "Others" appended after top customers when the cap is exceeded
      customers: hasOthers ? [...topCustomers, "Others"] : topCustomers,
    }
  }

  return result
}

/**
 * Returns per-fiber weighted net-price chart series for a single Europe country,
 * grouped by Customer (primary commercial view).
 *
 * Price formula: sum(price × volume) / sum(volume) per (customer, month, fiber).
 * Customers sorted by total volume descending within each fiber.
 */
export async function getEuropeCountryCustomerPriceSeries(params: {
  marketId: string
  country: string
  months: string[]
}): Promise<Record<string, { data: Record<string, string | number | null>[]; customers: string[] }>> {
  const { marketId, country, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: { ...CRM_FILTER, isNetPrice: true, country, cycle: { marketId, month: { in: months } } },
    select: {
      volume: true,
      price: true,
      fiber: { select: { code: true } },
      customer: { select: { name: true } },
      cycle: { select: { month: true } },
    },
  })

  const fiberCodes = [...new Set(orders.map((o) => o.fiber.code))].sort()
  const result: Record<string, { data: Record<string, string | number | null>[]; customers: string[] }> = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = orders.filter((o) => o.fiber.code === fiberCode)

    // Sort customers by total volume descending
    const customerVolMap = new Map<string, number>()
    for (const o of fiberOrders) {
      const cust = o.customer.name
      customerVolMap.set(cust, (customerVolMap.get(cust) ?? 0) + Number(o.volume))
    }
    const allCustomers = [...customerVolMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    // Cap chart series at EUROPE_CUSTOMER_CHART_CAP; remainder aggregated as "Others"
    const topCustomers = allCustomers.slice(0, EUROPE_CUSTOMER_CHART_CAP)
    const otherCustomers = allCustomers.slice(EUROPE_CUSTOMER_CHART_CAP)
    const hasOthers = otherCustomers.length > 0

    // Build monthMap for ALL customers so "Others" weighted avg is accurate
    const monthMap: Record<string, Record<string, { vol: number; val: number }>> = {}
    for (const m of months) {
      monthMap[m] = {}
      for (const cust of allCustomers) monthMap[m][cust] = { vol: 0, val: 0 }
    }
    for (const order of fiberOrders) {
      const cust = order.customer.name
      const month = order.cycle.month
      const vol = Number(order.volume)
      const price = selectEuropeNetPrice(order)  // net price only
      if (!monthMap[month]) monthMap[month] = {}
      if (!monthMap[month][cust]) monthMap[month][cust] = { vol: 0, val: 0 }
      monthMap[month][cust].vol += vol
      monthMap[month][cust].val += price * vol
    }

    result[fiberCode] = {
      data: months.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        for (const cust of topCustomers) {
          const { vol, val } = monthMap[m]?.[cust] ?? { vol: 0, val: 0 }
          point[cust] = vol > 0 ? val / vol : null
        }
        if (hasOthers) {
          // "Others" price = weighted average of excluded customers
          let othersVol = 0, othersVal = 0
          for (const cust of otherCustomers) {
            const { vol, val } = monthMap[m]?.[cust] ?? { vol: 0, val: 0 }
            othersVol += vol
            othersVal += val
          }
          point["Others"] = othersVol > 0 ? othersVal / othersVol : null
        }
        return point
      }),
      customers: hasOthers ? [...topCustomers, "Others"] : topCustomers,
    }
  }

  return result
}

export interface EuropeCustomerSummary {
  customer: string
  totalVolume: number
  avgNetPrice: number | null
  /** Distinct incoterms used by this customer in the selected window. */
  incotermsCount: number
  /** Number of distinct months with orders in the selected window. */
  monthsActive: number
}

/**
 * Returns one summary row per customer for a single Europe country.
 * Sorted by total volume descending.
 */
export async function getEuropeCountryCustomerSummaries(params: {
  marketId: string
  country: string
  months: string[]
}): Promise<EuropeCustomerSummary[]> {
  const { marketId, country, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: { ...CRM_FILTER, isNetPrice: true, country, cycle: { marketId, month: { in: months } } },
    select: {
      volume: true,
      price: true,
      incoterm: true,
      customer: { select: { name: true } },
      cycle: { select: { month: true } },
    },
  })

  type Acc = { totalVol: number; totalVal: number; incoterms: Set<string>; activeMonths: Set<string> }
  const map = new Map<string, Acc>()

  for (const order of orders) {
    const cust = order.customer.name
    if (!map.has(cust)) {
      map.set(cust, { totalVol: 0, totalVal: 0, incoterms: new Set(), activeMonths: new Set() })
    }
    const s = map.get(cust)!
    const vol = Number(order.volume)
    const price = selectEuropeNetPrice(order)  // net price only
    s.totalVol += vol
    s.totalVal += price * vol
    if (order.incoterm && order.incoterm.trim()) s.incoterms.add(order.incoterm)
    s.activeMonths.add(order.cycle.month)
  }

  return [...map.entries()]
    .map(([customer, { totalVol, totalVal, incoterms, activeMonths }]) => ({
      customer,
      totalVolume: totalVol,
      avgNetPrice: totalVol > 0 ? totalVal / totalVol : null,
      incotermsCount: incoterms.size,
      monthsActive: activeMonths.size,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume)
}

// ── Country detail — Incoterm view (secondary/logistics) ──────────────────────

/**
 * Returns per-fiber volume chart series for a single Europe country,
 * grouped by Incoterm (secondary logistics view).
 *
 * Only rows with a non-null, non-empty incoterm are included in the chart.
 * Returns an empty object when no incoterm data exists for the country.
 */
export async function getEuropeCountryIncotermVolumeSeries(params: {
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

/**
 * Returns per-fiber weighted net-price chart series AND flat order points for a
 * single Europe country, grouped by Incoterm (secondary logistics view).
 *
 * Chart series: only rows with a real incoterm value.
 * allPoints: every net-price row (with or without incoterm) for the detail table.
 */
export async function getEuropeCountryIncotermPriceSeries(params: {
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

export interface EuropeIncotermSummary {
  incoterm: string
  totalVolume: number
  avgNetPrice: number | null
  customerCount: number
}

/**
 * Returns one summary row per incoterm for a single Europe country.
 * Sorted by total volume descending.
 * Only includes rows with a non-null, non-empty incoterm.
 */
export async function getEuropeCountryIncotermSummaries(params: {
  marketId: string
  country: string
  months: string[]
}): Promise<EuropeIncotermSummary[]> {
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
      volume: true,
      price: true,
      incoterm: true,
      customer: { select: { name: true } },
    },
  })

  type Acc = { totalVol: number; totalVal: number; customers: Set<string> }
  const map = new Map<string, Acc>()

  for (const order of orders) {
    const inc = order.incoterm as string
    if (!map.has(inc)) {
      map.set(inc, { totalVol: 0, totalVal: 0, customers: new Set() })
    }
    const s = map.get(inc)!
    const vol = Number(order.volume)
    const price = selectEuropeNetPrice(order)  // net price only
    s.totalVol += vol
    s.totalVal += price * vol
    s.customers.add(order.customer.name)
  }

  return [...map.entries()]
    .map(([incoterm, { totalVol, totalVal, customers }]) => ({
      incoterm,
      totalVolume: totalVol,
      avgNetPrice: totalVol > 0 ? totalVal / totalVol : null,
      customerCount: customers.size,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume)
}

// ── Customer drill-down — /markets/europe/[country]/[customer] ────────────────

export interface EuropeCustomerIncotermSummary {
  incoterm: string
  totalVolume: number
  avgNetPrice: number | null
  monthsActive: number
}

/**
 * Returns per-fiber volume chart series for one Europe customer within one
 * country, grouped by Incoterm.
 *
 * Only rows with a non-null, non-empty incoterm are included in the chart.
 */
export async function getEuropeCustomerIncotermVolumeSeries(params: {
  marketId: string
  country: string
  customer: string
  months: string[]
}): Promise<Record<string, VolumeChartSeries>> {
  const { marketId, country, customer, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: {
      ...CRM_FILTER,
      isNetPrice: true,
      country,
      incoterm: { not: null, notIn: [""] },
      cycle: { marketId, month: { in: months } },
      customer: { name: customer },
    },
    select: {
      incoterm: true,
      volume: true,
      fiber: { select: { code: true } },
      cycle: { select: { month: true } },
    },
  })

  const fiberCodes = [...new Set(orders.map((o) => o.fiber.code))].sort()
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
      customers: incoterms,
    }
  }

  return result
}

/**
 * Returns per-fiber weighted net-price chart series AND flat order points for
 * one Europe customer within one country, grouped by Incoterm.
 *
 * allPoints includes every net-price row (including those without incoterm)
 * for the detail table.
 */
export async function getEuropeCustomerIncotermPriceSeries(params: {
  marketId: string
  country: string
  customer: string
  months: string[]
}): Promise<{
  chartDataByFiber: Record<string, { data: Record<string, string | number | null>[]; customers: string[] }>
  allPoints: EuropeCountryPricePoint[]
}> {
  const { marketId, country, customer, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: {
      ...CRM_FILTER,
      isNetPrice: true,
      country,
      cycle: { marketId, month: { in: months } },
      customer: { name: customer },
    },
    select: {
      incoterm: true,
      volume: true,
      price: true,
      fiber: { select: { code: true } },
      customer: { select: { name: true } },
      cycle: { select: { month: true } },
    },
    orderBy: [{ cycle: { month: "desc" } }],
  })

  // Chart series: only rows with a real incoterm value
  const ordersWithIncoterm = orders.filter((o) => o.incoterm && o.incoterm.trim())
  const fiberCodes = [...new Set(ordersWithIncoterm.map((o) => o.fiber.code))].sort()
  const chartDataByFiber: Record<
    string,
    { data: Record<string, string | number | null>[]; customers: string[] }
  > = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = ordersWithIncoterm.filter((o) => o.fiber.code === fiberCode)
    const incoterms = [...new Set(fiberOrders.map((o) => o.incoterm as string))].sort()

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

/**
 * Returns one summary row per incoterm for one Europe customer within one
 * country. Sorted by total volume descending.
 */
export async function getEuropeCustomerIncotermSummaries(params: {
  marketId: string
  country: string
  customer: string
  months: string[]
}): Promise<EuropeCustomerIncotermSummary[]> {
  const { marketId, country, customer, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: {
      ...CRM_FILTER,
      isNetPrice: true,
      country,
      incoterm: { not: null, notIn: [""] },
      cycle: { marketId, month: { in: months } },
      customer: { name: customer },
    },
    select: {
      volume: true,
      price: true,
      incoterm: true,
      cycle: { select: { month: true } },
    },
  })

  type Acc = { totalVol: number; totalVal: number; activeMonths: Set<string> }
  const map = new Map<string, Acc>()

  for (const order of orders) {
    const inc = order.incoterm as string
    if (!map.has(inc)) map.set(inc, { totalVol: 0, totalVal: 0, activeMonths: new Set() })
    const s = map.get(inc)!
    const vol = Number(order.volume)
    const price = selectEuropeNetPrice(order)  // net price only
    s.totalVol += vol
    s.totalVal += price * vol
    s.activeMonths.add(order.cycle.month)
  }

  return [...map.entries()]
    .map(([incoterm, { totalVol, totalVal, activeMonths }]) => ({
      incoterm,
      totalVolume: totalVol,
      avgNetPrice: totalVol > 0 ? totalVal / totalVol : null,
      monthsActive: activeMonths.size,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume)
}
