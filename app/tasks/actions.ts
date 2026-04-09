"use server"

import { setMarketTaskStatus } from "@/lib/market-tasks"
import { revalidatePath } from "next/cache"

export async function completeTaskAction(formData: FormData) {
  const taskId = formData.get("taskId") as string
  await setMarketTaskStatus(taskId, "done")
  revalidatePath("/tasks")
  revalidatePath("/")
}
