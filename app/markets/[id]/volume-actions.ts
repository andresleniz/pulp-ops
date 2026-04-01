"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"

export async function addVolumeAdjustment(formData: FormData) {
  const marketId = formData.get("marketId") as string
  const month = formData.get("month") as string
  const customerId = (formData.get("customerId") as string) || null
  const volumeAdt = parseFloat(formData.get("volumeAdt") as string)
  const reason = (formData.get("reason") as string) || null

  await prisma.volumeAdjustment.create({
    data: {
      marketId,
      month,
      customerId: customerId || null,
      volumeAdt: new Decimal(volumeAdt),
      reason,
    },
  })

  revalidatePath(`/markets/${marketId}`)
}

export async function deleteVolumeAdjustment(id: string, marketId: string) {
  await prisma.volumeAdjustment.delete({ where: { id } })
  revalidatePath(`/markets/${marketId}`)
}
