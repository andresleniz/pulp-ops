"use server"

import {
  generateEmailsForMonth,
  markEmailSent,
  updateDraftBody,
} from "@/lib/email-engine"
import { revalidatePath } from "next/cache"

export async function generateAllDrafts(formData: FormData) {
  const month = formData.get("month") as string
  await generateEmailsForMonth(month)
  revalidatePath("/emails")
}

export async function markSent(formData: FormData) {
  const draftId = formData.get("draftId") as string
  await markEmailSent(draftId, "Andrés")
  revalidatePath("/emails")
}

export async function updateBody(formData: FormData) {
  const draftId = formData.get("draftId") as string
  const body = formData.get("body") as string
  await updateDraftBody(draftId, body, undefined, "Andrés")
  revalidatePath("/emails")
}