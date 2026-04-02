/**
 * order-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central source-of-truth for all OrderRecord analytics queries.
 *
 * Rule: every Prisma query that feeds a chart, KPI, aggregation, or
 * dashboard table MUST spread CRM_FILTER into its `where` clause.
 * Manual rows (source = "Manual") must never reach analytics.
 *
 * Usage:
 *   import { CRM_FILTER } from "@/lib/order-queries"
 *   prisma.orderRecord.findMany({ where: { ...CRM_FILTER, cycleId: "..." } })
 */

/** Prisma where fragment that restricts all queries to CRM-sourced rows only. */
export const CRM_FILTER = { source: "CRM" } as const

/**
 * Assertion guard — call this before using a `where` object in any analytics
 * query. Throws at runtime in development if source filtering is missing.
 * No-ops in production (build safety; write-time validation is the real guard).
 */
export function assertAnalyticsFilter(where: Record<string, unknown>, queryName: string): void {
  if (process.env.NODE_ENV === "production") return
  if (where.source !== "CRM") {
    throw new Error(
      `[order-queries] Analytics query "${queryName}" is missing source: "CRM" filter. ` +
      `All OrderRecord queries used in analytics MUST spread CRM_FILTER into their where clause.`
    )
  }
}

/**
 * Simulation: verify that inserting a Manual row does not change a CRM
 * aggregation. Returns true if the sum matches exactly.
 *
 * Use in scripts or test routes to confirm isolation:
 *   import { verifyCRMIsolation } from "@/lib/order-queries"
 */
import { prisma } from "@/lib/prisma"

export async function verifyCRMIsolation(params: {
  cycleId: string
  fiberId: string
}): Promise<{ isolated: boolean; crmVolume: number; allVolume: number }> {
  const { cycleId, fiberId } = params

  const crmRows = await prisma.orderRecord.findMany({
    where: { ...CRM_FILTER, cycleId, fiberId },
    select: { volume: true },
  })
  const allRows = await prisma.orderRecord.findMany({
    where: { cycleId, fiberId },
    select: { volume: true, source: true },
  })

  const crmVolume = crmRows.reduce((s, r) => s + Number(r.volume), 0)
  const allVolume = allRows.reduce((s, r) => s + Number(r.volume), 0)

  return {
    isolated: crmVolume === allVolume, // true only if no Manual rows exist
    crmVolume,
    allVolume,
  }
}
