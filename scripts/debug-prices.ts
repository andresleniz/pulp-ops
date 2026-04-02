import { prisma } from "../lib/prisma"

async function main() {
  const markets = await prisma.market.findMany({ select: { id: true, name: true } })

  for (const market of markets) {
    const prices = await prisma.monthlyPrice.findMany({
      where: { marketId: market.id, cycle: { month: "2026-03" } },
      include: { fiber: true, customer: true, cycle: true },
    })
    if (prices.length === 0) continue

    console.log(`\n── ${market.name} ──`)
    for (const p of prices) {
      console.log(
        `  ${p.cycle.month} | ${p.fiber.code} | ${p.customer?.name ?? "(standard)"} | $${p.price} | isOverride=${p.isOverride} | source=${p.formulaSnapshot ?? "null"}`
      )
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
