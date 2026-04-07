"use server"

import { revalidatePath } from "next/cache"
import { upsertMarketNote } from "@/lib/market-notes"

export async function saveMarketNote(formData: FormData) {
  const marketId = formData.get("marketId") as string
  const month = formData.get("month") as string
  const cycleId = (formData.get("cycleId") as string) || null
  const content = (formData.get("content") as string) ?? ""

  await upsertMarketNote(marketId, month, cycleId, content)
  revalidatePath(`/markets/${marketId}`)
}
