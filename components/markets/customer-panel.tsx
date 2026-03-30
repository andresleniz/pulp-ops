"use client"

import { useState, useTransition } from "react"
import { addCustomer, updateCustomerRule } from "@/app/markets/[id]/actions"

interface Customer {
  id: string
  name: string
  contactEmail: string | null
  notes: string | null
  pricingNote: string | null
}

interface Props {
  marketId: string
  customers: Customer[]
  fibers: { id: string; code: string }[]
}

export function CustomerPanel({ marketId, customers, fibers }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.append("marketId", marketId)
    startTransition(async () => {
      await addCustomer(fd)
      setShowAdd(false)
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
          Customers
        </p>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs text-blue-600 hover:underline"
        >
          + Add Customer
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 bg-blue-50 rounded-lg p-3 space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              name="name"
              required
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
              placeholder="Customer name"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input
              name="contactEmail"
              type="email"
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
              placeholder="email@company.com"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input
              name="notes"
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
              placeholder="Optional notes"
            />
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
              onClick={() => setShowAdd(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {customers.map((c) => (
          <CustomerRow
            key={c.id}
            customer={c}
            fibers={fibers}
            marketId={marketId}
          />
        ))}
        {customers.length === 0 && !showAdd && (
          <p className="text-xs text-gray-400">No customers added yet.</p>
        )}
      </div>
    </div>
  )
}

function CustomerRow({
  customer,
  fibers,
  marketId,
}: {
  customer: Customer
  fibers: { id: string; code: string }[]
  marketId: string
}) {
  const [showRules, setShowRules] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.append("customerId", customer.id)
    fd.append("marketId", marketId)
    startTransition(async () => {
      await updateCustomerRule(fd)
      setShowRules(false)
    })
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
        <div>
          <p className="text-sm font-medium text-gray-900">{customer.name}</p>
          {customer.contactEmail && (
            <p className="text-xs text-gray-400">{customer.contactEmail}</p>
          )}
        </div>
        <button
          onClick={() => setShowRules(!showRules)}
          className="text-xs text-blue-600 hover:underline"
        >
          {showRules ? "Hide" : "Pricing Rules"}
        </button>
      </div>

      {customer.notes && (
        <div className="px-3 py-1 text-xs text-gray-500 border-t border-gray-100">
          {customer.notes}
        </div>
      )}

      {showRules && (
        <form onSubmit={handleRule} className="px-3 py-3 border-t border-gray-100 space-y-2">
          <p className="text-xs font-medium text-gray-600 mb-2">Set pricing rule</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fiber</label>
              <select
                name="fiberId"
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
              >
                {fibers.map((f) => (
                  <option key={f.id} value={f.id}>{f.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Method</label>
              <select
                name="method"
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
              >
                <option value="manual">Manual</option>
                <option value="index_formula">Index Formula</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Price or Formula
            </label>
            <input
              name="priceOrFormula"
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="e.g. 620 or PIX_CHINA + 10"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50"
            >
              Save Rule
            </button>
            <button
              type="button"
              onClick={() => setShowRules(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}