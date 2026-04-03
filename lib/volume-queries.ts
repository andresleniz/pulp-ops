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
