"use client"

import { useTransition, useRef, useState } from "react"
import { saveMarketNote } from "@/app/markets/[id]/note-actions"

export function MarketNotesPanel({
  marketId,
  month,
  cycleId,
  initialContent,
}: {
  marketId: string
  month: string
  cycleId: string | null
  initialContent: string
}) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  function handleSave(formData: FormData) {
    startTransition(async () => {
      await saveMarketNote(formData)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <form ref={formRef} action={handleSave} className="space-y-2">
      <input type="hidden" name="marketId" value={marketId} />
      <input type="hidden" name="month" value={month} />
      {cycleId && <input type="hidden" name="cycleId" value={cycleId} />}
      <textarea
        name="content"
        defaultValue={initialContent}
        rows={6}
        placeholder="Type notes for this market / month…"
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs resize-y leading-relaxed"
      />
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs py-1.5 rounded transition-colors disabled:opacity-40"
      >
        {isPending ? "Saving…" : saved ? "Saved" : "Save Notes"}
      </button>
    </form>
  )
}
