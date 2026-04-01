"use client"

import { useTransition, useRef } from "react"
import { addVolumeAdjustment, deleteVolumeAdjustment } from "@/app/markets/[id]/volume-actions"

type Adjustment = {
  id: string
  customerId: string | null
  customerName: string | null
  fiberId: string | null
  fiberCode: string | null
  volumeAdt: number
  reason: string | null
}

type Customer = { id: string; name: string }
type Fiber = { id: string; code: string }

export function VolumeAdjustmentPanel({
  marketId,
  month,
  customers,
  fibers,
  adjustments,
}: {
  marketId: string
  month: string
  customers: Customer[]
  fibers: Fiber[]
  adjustments: Adjustment[]
}) {
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      await addVolumeAdjustment(formData)
      formRef.current?.reset()
    })
  }

  function handleDelete(id: string) {
    startTransition(() => deleteVolumeAdjustment(id, marketId))
  }

  const total = adjustments.reduce((s, a) => s + a.volumeAdt, 0)

  return (
    <div className="space-y-3">
      {adjustments.length === 0 ? (
        <p className="text-xs text-gray-400">No adjustments for {month}.</p>
      ) : (
        <div className="space-y-1.5">
          {adjustments.map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-2 text-xs bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5"
            >
              <div className="min-w-0">
                <span className="font-medium text-gray-700">
                  {a.customerName ?? "Market-wide"}
                </span>
                {a.fiberCode && (
                  <span className="ml-1.5 text-xs font-mono bg-gray-100 text-gray-600 px-1 py-0.5 rounded">
                    {a.fiberCode}
                  </span>
                )}
                <span
                  className={`ml-2 font-semibold ${a.volumeAdt < 0 ? "text-red-600" : "text-green-600"}`}
                >
                  {a.volumeAdt > 0 ? "+" : ""}
                  {a.volumeAdt.toLocaleString()} ADT
                </span>
                {a.reason && (
                  <p className="text-gray-400 mt-0.5 truncate">{a.reason}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(a.id)}
                disabled={isPending}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <div className="text-xs text-right font-medium pt-1 border-t border-gray-100">
            Net adjustment:{" "}
            <span className={total < 0 ? "text-red-600" : "text-green-600"}>
              {total > 0 ? "+" : ""}
              {total.toLocaleString()} ADT
            </span>
          </div>
        </div>
      )}

      <form ref={formRef} action={handleAdd} className="space-y-2 pt-1 border-t border-gray-100">
        <input type="hidden" name="marketId" value={marketId} />
        <input type="hidden" name="month" value={month} />

        <div>
          <label className="block text-xs text-gray-400 mb-1">Grade</label>
          <select
            name="fiberId"
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white"
          >
            <option value="">All grades</option>
            {fibers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Customer (optional)</label>
          <select
            name="customerId"
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white"
          >
            <option value="">Market-wide</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Volume ADT (negative = reduction)</label>
          <input
            type="number"
            name="volumeAdt"
            step="1"
            placeholder="-500"
            required
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Reason</label>
          <input
            type="text"
            name="reason"
            placeholder="e.g. Supply constraint Q1"
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-amber-600 text-white text-xs py-1.5 rounded hover:bg-amber-700 transition-colors disabled:opacity-40"
        >
          {isPending ? "Saving…" : "+ Add Adjustment"}
        </button>
      </form>
    </div>
  )
}
