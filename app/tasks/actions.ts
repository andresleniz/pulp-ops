"use server"

import { resolveTask, generateTasksForMonth } from "@/lib/task-engine"
import { revalidatePath } from "next/cache"

export async function resolveTaskAction(formData: FormData) {
  const taskId = formData.get("taskId") as string
  await resolveTask(taskId, "Andrés")
  revalidatePath("/tasks")
}

export async function generateTasksAction(formData: FormData) {
  const month = formData.get("month") as string
  await generateTasksForMonth(month)
  revalidatePath("/tasks")
}