"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

function getNextMonth(current: string): string {
  const [y, m] = current.split("-").map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, "0")}`
}

export async function createNextMonthCycles(formData: FormData) {
  const currentMonth = formData.get("currentMonth") as string
  const nextMonth = getNextMonth(currentMonth)
  const markets = await prisma.market.findMany({ select: { id: true } })

  for (const market of markets) {
    const existing = await prisma.monthlyCycle.findUnique({
      where: { month_marketId: { month: nextMonth, marketId: market.id } },
    })
    if (existing) continue

    await prisma.monthlyCycle.create({
      data: {
        month: nextMonth,
        marketId: market.id,
        priceStatus: "not_started",
        commStatus: "pending",
        orderStatus: "none",
        cycleStatus: "open",
        onHold: false,
        owner: "Andrés",
      },
    })
  }

  revalidatePath("/")
}