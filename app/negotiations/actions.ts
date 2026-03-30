"use server"

import { prisma } from "@/lib/prisma"
import Decimal from "decimal.js"
import { revalidatePath } from "next/cache"

export async function addNegotiationEntry(formData: FormData) {
  const marketId = formData.get("marketId") as string
  const fiberId = formData.get("fiberId") as string
  const date = formData.get("date") as string
  const month = formData.get("month") as string
  const priceStr = formData.get("price") as string
  const status = formData.get("status") as string
  const summary = formData.get("summary") as string
  const nextStep = formData.get("nextStep") as string

  const cycle = await prisma.monthlyCycle.findUnique({
    where: { month_marketId: { month, marketId } },
  })

  await prisma.negotiationEvent.create({
    data: {
      date: new Date(date),
      month,
      marketId,
      cycleId: cycle?.id ?? null,
      fiberId,
      discussedPrice: priceStr ? new Decimal(priceStr) : null,
      status: status as any,
      summary: summary || null,
      nextStep: nextStep || null,
      owner: "Andrés",
    },
  })

  revalidatePath("/negotiations")
}