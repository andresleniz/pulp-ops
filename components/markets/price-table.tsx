"use client"

import React, { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { applyPriceOverride, addPriceRow, setStandardPrices, deletePriceRow } from "@/app/markets/[id]/actions"
import { getPriceSource } from "@/lib/price-source"

interface PriceRow {
  id: string
  fiberCode: string
  customerName: string | null
  millName: string | null
  price: number | null
  method: string | null
  formulaSnapshot: string | null
  isOverride: boolean
  overrideReason: string | null
  cycleId: string
  fiberId: string
  millId: string | null
  customerId: string | null
}

interface Customer {
  id: string
  name: string
}

interface Fiber {
  id: string
  code: string
}

interface Props {
  prices: PriceRow[]
  cycleId: string
  marketId: string
  customers: Customer[]
  fibers: Fiber[]
}

export function PriceTable({ prices, cycleId, marketId, customers, fibers }: Props) {
  const router = useRouter()
  const [overrideRow, setOverrideRow] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showStandard, setShowStandard] = useState(false)
  const [standardInputs, setStandardInputs] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  // Separate standard (no customer, no mill) from customer-specific prices
  const standardPrices = prices.filter((p) => !p.customerId && !p.millId)
  const customerPrices = prices.filter((p) => p.customerId || p.millId)

  function submitOverride(row: PriceRow, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.append("cycleId", row.cycleId)
    fd.append("fiberId", row.fiberId)
    if (row.millId) fd.append("millId", row.millId)
    if (row.customerId) fd.append("customerId", row.customerId)
    startTransition(async () => {
      await applyPriceOverride(fd)
      setOverrideRow(null)
      router.refresh()
    })
  }

  function submitAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.append("cycleId", cycleId)
    startTransition(async () => {
      await addPriceRow(fd)
      setShowAdd(false)
      router.refresh()
    })
  }

  function submitStandard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const entries = fibers
      .map((f) => ({ fiberId: f.id, price: parseFloat(standardInputs[f.id] ?? "") }))
      .filter((e) => !isNaN(e.price) && e.price > 0)
    if (entries.length === 0) return
    startTransition(async () => {
      await setStandardPrices(cycleId, entries)
      setShowStandard(false)
      setStandardInputs({})
      router.refresh()
    })
  }

  function PriceRowUI({ row }: { row: PriceRow }) {
    return (
      <React.Fragment key={row.id}>
        <tr className="border-b border-gray-50 hover:bg-gray-50">
          <td className="py-2 text-gray-700">{row.customerName ?? row.millName ?? <span className="text-xs text-gray-400 italic">standard</span>}</td>
          <td className="py-2 font-semibold">{row.fiberCode}</td>
          <td className="py-2 text-gray-500 text-xs">{row.millName && row.customerName ? row.millName : "—"}</td>
          <td className="py-2">
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${row.isOverride ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                {row.isOverride ? "override" : (row.method ?? "manual")}
              </span>
              {(() => {
                const src = getPriceSource(row.formulaSnapshot, row.isOverride)
                if (src === "crm") return (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">CRM</span>
                )
                if (src === "manual") return (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">manual</span>
                )
                return null
              })()}
            </div>
          </td>
          <td className="py-2 text-right font-semibold">
            {row.price !== null
              ? `$${row.price}`
              : <span className="text-gray-400 text-xs">Not set</span>
            }
            {row.isOverride && row.overrideReason && (
              <div className="text-xs text-purple-500 font-normal">{row.overrideReason}</div>
            )}
          </td>
          <td className="py-2 text-right">
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setOverrideRow(overrideRow === row.id ? null : row.id)}
                className="text-xs text-blue-600 hover:underline"
              >
                Set Price
              </button>
              <button
                onClick={() => {
                  startTransition(async () => {
                    await deletePriceRow(row.id, marketId)
                    router.refresh()
                  })
                }}
                disabled={pending}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                title="Delete price"
              >
                ×
              </button>
            </div>
          </td>
        </tr>
        {overrideRow === row.id && (
          <tr>
            <td colSpan={6} className="pb-3 pt-1">
              <form
                onSubmit={(e) => submitOverride(row, e)}
                className="flex gap-2 items-center bg-blue-50 rounded p-2"
              >
                <input
                  type="number"
                  name="price"
                  placeholder="Price USD/ADT"
                  step="0.01"
                  defaultValue={row.price ?? undefined}
                  className="border border-gray-200 rounded px-2 py-1 text-sm w-32"
                  required
                />
                <input
                  type="text"
                  name="reason"
                  placeholder="Reason (optional)"
                  className="border border-gray-200 rounded px-2 py-1 text-sm flex-1"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setOverrideRow(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </form>
            </td>
          </tr>
        )}
      </React.Fragment>
    )
  }

  return (
    <div>
      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="text-xs text-gray-400 border-b">
            <th className="text-left pb-2 font-medium">Customer</th>
            <th className="text-left pb-2 font-medium">Fiber</th>
            <th className="text-left pb-2 font-medium">Mill</th>
            <th className="text-left pb-2 font-medium">Method</th>
            <th className="text-right pb-2 font-medium">Price (USD/ADT)</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {standardPrices.map((row) => <PriceRowUI key={row.id} row={row} />)}
          {customerPrices.map((row) => <PriceRowUI key={row.id} row={row} />)}
          {prices.length === 0 && !showStandard && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-gray-400 text-sm">
                No prices for this month.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="space-y-3">
        {/* Standard prices panel */}
        {showStandard ? (
          <form onSubmit={submitStandard} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-3">Set standard prices (market-wide, no customer)</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {fibers.map((f) => {
                const existing = standardPrices.find((p) => p.fiberCode === f.code)
                return (
                  <div key={f.id} className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700 w-12">{f.code}</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={existing ? String(existing.price) : "USD/ADT"}
                      value={standardInputs[f.id] ?? ""}
                      onChange={(e) => setStandardInputs((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      className="border border-gray-200 rounded px-2 py-1 text-sm w-28"
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => { setShowStandard(false); setStandardInputs({}) }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowStandard(true)}
            className="text-xs text-blue-600 hover:underline"
          >
            {standardPrices.length > 0 ? "Edit standard prices" : "+ Set standard prices"}
          </button>
        )}

        {/* Per-customer add panel */}
        {showAdd ? (
          <form onSubmit={submitAdd} className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-2">Add customer-specific price</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Customer</label>
                <select
                  name="customerId"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fiber</label>
                <select
                  name="fiberId"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
                  required
                >
                  {fibers.map((f) => (
                    <option key={f.id} value={f.id}>{f.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Price (USD/ADT)</label>
                <input
                  type="number"
                  name="price"
                  step="0.01"
                  placeholder="e.g. 685"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-blue-600 hover:underline"
          >
            + Add customer-specific price
          </button>
        )}
      </div>
    </div>
  )
}