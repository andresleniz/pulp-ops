export const dynamic = "force-dynamic"

import { prisma } from "@/lib/prisma"
import { addNegotiationEntry } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const statusStyle: Record<string, string> = {
  open: "bg-gray-100 text-gray-600",
  agreed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-700",
  withdrawn: "bg-gray-100 text-gray-500",
}

export default async function NegotiationsPage() {
  const currentMonth = new Date().toISOString().slice(0, 7)

  const [events, markets, fibers] = await Promise.all([
    prisma.negotiationEvent.findMany({
      include: { market: true, fiber: true, customer: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
    prisma.market.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.fiber.findMany({ orderBy: { code: "asc" } }),
  ])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Negotiation Log</h1>
        <p className="text-sm text-gray-500 mt-1">All markets</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Market</th>
                    <th className="text-left px-4 py-3 font-medium">Fiber</th>
                    <th className="text-right px-4 py-3 font-medium">Price</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Summary</th>
                    <th className="text-left px-4 py-3 font-medium">Next Step</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                        {ev.date.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {ev.market.name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{ev.fiber.code}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {ev.discussedPrice !== null
                          ? `$${Number(ev.discussedPrice)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle[ev.status]}`}>
                          {ev.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs max-w-xs truncate">
                        {ev.summary}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">
                        {ev.nextStep}
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-400 text-sm"
                      >
                        No negotiation events recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addNegotiationEntry} className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Market</label>
                  <select
                    name="marketId"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white"
                  >
                    {markets.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fiber</label>
                  <select
                    name="fiberId"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white"
                  >
                    {fibers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    name="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Month</label>
                  <input
                    type="month"
                    name="month"
                    defaultValue={currentMonth}
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Price Discussed (USD/ADT)
                  </label>
                  <input
                    type="number"
                    name="price"
                    step="0.01"
                    placeholder="e.g. 640"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Status</label>
                  <select
                    name="status"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="open">Open</option>
                    <option value="agreed">Agreed</option>
                    <option value="rejected">Rejected</option>
                    <option value="pending">Pending</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Summary</label>
                  <textarea
                    name="summary"
                    rows={2}
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm resize-none"
                    placeholder="Brief summary..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Next Step</label>
                  <input
                    type="text"
                    name="nextStep"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                    placeholder="e.g. Follow up call Friday"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-gray-900 text-white text-sm py-2 rounded-md hover:bg-gray-700 transition-colors"
                >
                  Add Entry
                </button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}