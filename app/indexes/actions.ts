"use server"

import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { recalculateMonth } from "@/lib/pricing-engine"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import { addWidget, removeWidget, reorderWidgets } from "@/lib/page-layout"

// ── Layout actions ────────────────────────────────────────────────────────────

export async function addIndexWidget(key: string) {
  await addWidget("indexes", key)
  revalidatePath("/indexes")
}

export async function removeIndexWidget(key: string) {
  await removeWidget("indexes", key)
  revalidatePath("/indexes")
}

export async function reorderIndexWidgets(keys: string[]) {
  await reorderWidgets("indexes", keys)
  revalidatePath("/indexes")
}

export async function saveIndexValue(formData: FormData) {
  const indexId = formData.get("indexId") as string
  const month = formData.get("month") as string
  const value = parseFloat(formData.get("value") as string)
  const pubDateStr = formData.get("publicationDate") as string

  const existing = await prisma.indexValue.findUnique({
    where: { indexId_month: { indexId, month } },
  })

  await prisma.indexValue.upsert({
    where: { indexId_month: { indexId, month } },
    update: {
      value: new Decimal(value),
      publicationDate: pubDateStr ? new Date(pubDateStr) : undefined,
      updatedAt: new Date(),
    },
    create: {
      indexId,
      month,
      value: new Decimal(value),
      publicationDate: pubDateStr ? new Date(pubDateStr) : undefined,
    },
  })

  await logAudit({
    entity: "IndexValue",
    entityId: indexId,
    field: `value [${month}]`,
    oldValue: existing?.value ? String(existing.value) : null,
    newValue: String(value),
    changedBy: "Andrés",
    month,
  })

  revalidatePath("/indexes")
  revalidatePath("/")
}

export async function triggerRecalculate(formData: FormData) {
  const month = formData.get("month") as string
  await recalculateMonth(month, "Andrés")
  revalidatePath("/")
  revalidatePath("/indexes")
}