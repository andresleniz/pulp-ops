/**
 * test-dashboard-market-visibility.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression guard: proves that dashboard market cards are returned correctly
 * for every month that has cycles.
 *
 * Run with: npm run test:dashboard
 *
 * What it tests:
 *   1. For every month that has cycles, the dashboard query returns all
 *      expected markets (MARKET_DISPLAY_ORDER list).
 *
 * Failure means either the data is missing cycles or the query path has
 * been accidentally wired to the layout system.
 */

import assert from "assert"
import { PrismaClient } from "@prisma/client"
import { MARKET_DISPLAY_ORDER, sortByDisplayOrder } from "../lib/dashboard-queries"

const prisma = new PrismaClient()

// ── Replicate exact dashboard query ──────────────────────────────────────────

async function fetchCyclesForMonth(month: string) {
  const cycles = await prisma.monthlyCycle.findMany({
    where: { month },
    include: {
      market: { include: { region: true } },
      monthlyPrices: { include: { fiber: true, mill: true } },
    },
  })
  return sortByDisplayOrder(cycles)
}

// ── Assertions ────────────────────────────────────────────────────────────────

function assertAllMarketsPresent(
  month: string,
  cycles: { market: { name: string } }[]
) {
  assert(
    cycles.length === MARKET_DISPLAY_ORDER.length,
    `${month}: expected ${MARKET_DISPLAY_ORDER.length} markets, got ${cycles.length}`
  )
  const names = cycles.map((c) => c.market.name)
  for (const expected of MARKET_DISPLAY_ORDER) {
    assert(
      names.includes(expected),
      `${month}: market "${expected}" missing from dashboard (got: ${names.join(", ")})`
    )
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Dashboard market visibility regression test\n")

  // Gather all months that have cycles
  const monthRows = await prisma.monthlyCycle.findMany({
    select: { month: true },
    distinct: ["month"],
    orderBy: { month: "desc" },
  })
  const months = monthRows.map((r) => r.month)

  if (months.length === 0) {
    console.log("SKIP: no months with cycles found in DB")
    await prisma.$disconnect()
    return
  }

  for (const month of months) {
    const cycles = await fetchCyclesForMonth(month)
    assertAllMarketsPresent(month, cycles)
    const indiaPresent = cycles.some((c) => c.market.name === "India")
    console.log(
      `  ${month}: ${cycles.length} markets ✓  (India: ${indiaPresent ? "present" : "MISSING"})`
    )
  }

  await prisma.$disconnect()
  console.log("\nAll assertions passed ✓")
}

main().catch(async (err) => {
  console.error("\nFAIL:", err.message)
  await prisma.$disconnect()
  process.exit(1)
})
