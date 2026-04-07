"use server"

import { revalidatePath } from "next/cache"
import { createMarketTask, setMarketTaskStatus } from "@/lib/market-tasks"
import type { MarketTaskStatus } from "@prisma/client"

export async function addMarketTask(formData: FormData) {
  const marketId = formData.get("marketId") as string
  const month = formData.get("month") as string
  const cycleId = (formData.get("cycleId") as string) || null
  const title = (formData.get("title") as string).trim()
  if (!title) return

  await createMarketTask(marketId, month, cycleId, title)
  revalidatePath(`/markets/${marketId}`)
}

export async function toggleMarketTask(
  taskId: string,
  newStatus: MarketTaskStatus,
  marketId: string,
) {
  await setMarketTaskStatus(taskId, newStatus)
  revalidatePath(`/markets/${marketId}`)
}
