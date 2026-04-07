import { prisma } from "@/lib/prisma"

export interface BackfillResult {
  monthsScanned: number
  cyclesCreated: number
  alreadyPresent: number
  details: { month: string; created: string[]; skipped: string[] }[]
}

/**
 * Ensures that every month already present in MonthlyCycle has a cycle row
 * for every active market. Missing rows are created with default open status.
 * Existing rows are never modified.
 *
 * Safe to run multiple times — all writes are guarded by a findUnique check
 * before any create.
 */
export async function backfillAllMarketCycles(): Promise<BackfillResult> {
  const allMarkets = await prisma.market.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  const allCycles = await prisma.monthlyCycle.findMany({
    select: { month: true, marketId: true },
  })

  const months = [...new Set(allCycles.map((c) => c.month))].sort()
  const presentByMonth = new Map<string, Set<string>>()
  for (const c of allCycles) {
    if (!presentByMonth.has(c.month)) presentByMonth.set(c.month, new Set())
    presentByMonth.get(c.month)!.add(c.marketId)
  }

  const result: BackfillResult = {
    monthsScanned: months.length,
    cyclesCreated: 0,
    alreadyPresent: 0,
    details: [],
  }

  for (const month of months) {
    const present = presentByMonth.get(month) ?? new Set<string>()
    const created: string[] = []
    const skipped: string[] = []

    for (const market of allMarkets) {
      if (present.has(market.id)) {
        skipped.push(market.name)
        result.alreadyPresent++
        continue
      }

      // Double-check at DB level before writing to avoid any race condition
      const existing = await prisma.monthlyCycle.findUnique({
        where: { month_marketId: { month, marketId: market.id } },
        select: { id: true },
      })

      if (!existing) {
        await prisma.monthlyCycle.create({
          data: { month, marketId: market.id, owner: "System" },
        })
        created.push(market.name)
        result.cyclesCreated++
      } else {
        skipped.push(market.name)
        result.alreadyPresent++
      }
    }

    result.details.push({ month, created, skipped })
  }

  return result
}
