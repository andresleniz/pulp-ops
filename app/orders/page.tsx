export const dynamic = "force-dynamic"

import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { CRM_FILTER } from "@/lib/order-queries"

const statusStyle: Record<string, string> = {
  none: "bg-gray-100 text-gray-500",
  discussed: "bg-amber-100 text-amber-700",
  agreed: "bg-blue-100 text-blue-700",
  ordered: "bg-green-100 text-green-700",
  shipped: "bg-green-200 text-green-800",
  closed: "bg-gray-200 text-gray-600",
}

export default async function OrdersPage() {
  const orders = await prisma.orderRecord.findMany({
    where: { ...CRM_FILTER },
    include: {
      customer: true,
      fiber: true,
      mill: true,
      cycle: { include: { market: true } },
    },
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    take: 100,
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Order Records</h1>
        <p className="text-sm text-gray-500 mt-1">{orders.length} records</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium">Month</th>
                <th className="text-left px-4 py-3 font-medium">Market</th>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Fiber</th>
                <th className="text-left px-4 py-3 font-medium">Mill</th>
                <th className="text-right px-4 py-3 font-medium">Volume (ADT)</th>
                <th className="text-right px-4 py-3 font-medium">Price</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Ref</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                    {o.month}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    {o.cycle.market.name}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{o.customer.name}</td>
                  <td className="px-4 py-2.5">{o.fiber.code}</td>
                  <td className="px-4 py-2.5 text-gray-500">{o.mill?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {Number(o.volume).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    ${Number(o.price)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle[o.status]}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">
                    {o.reference ?? "—"}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-gray-400 text-sm"
                  >
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}