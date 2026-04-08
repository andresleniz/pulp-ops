"use server"

import { revalidatePath } from "next/cache"
import { addWidget, removeWidget, reorderWidgets } from "@/lib/page-layout"

export async function addChartWidget(key: string) {
  await addWidget("charts", key)
  revalidatePath("/charts")
}

export async function removeChartWidget(key: string) {
  await removeWidget("charts", key)
  revalidatePath("/charts")
}

export async function reorderChartWidgets(keys: string[]) {
  await reorderWidgets("charts", keys)
  revalidatePath("/charts")
}
