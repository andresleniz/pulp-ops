import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"

const CURRENT_MONTH = "2026-03"

const priceStatusStyle: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  negotiating: "bg-amber-100 text-amber-700",
  decided: "bg-green-100 text-green-700",
  revised: "bg-blue-100 text-blue-700",
}

export default async function MarketsPage() {
  const cycles = await prisma.monthlyCycle.findMany({
    where: { month: CURRENT_MONTH },
    include: {
      market: { include: { region: true } },
      monthlyPrices: { include: { fiber: true, mill: true } },
    },
    orderBy: { market: { name: "asc" } },
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">All Markets</h1>
        <p className="text-sm text-gray-500 mt-1">April 2025</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium">Market</th>
                <th className="text-left px-4 py-3 font-medium">Region</th>
                <th className="text-left px-4 py-3 font-medium">Price Status</th>
                <th className="text-left px-4 py-3 font-medium">Comm Status</th>
                <th className="text-left px-4 py-3 font-medium">Cycle Status</th>
                <th className="text-left px-4 py-3 font-medium">BKP</th>
                <th className="text-left px-4 py-3 font-medium">EKP</th>
                <th className="text-left px-4 py-3 font-medium">UKP</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => {
                const getPrice = (code: string) => {
                  const p = cycle.monthlyPrices.find(
                    (mp) => mp.fiber.code === code && !mp.millId
                  )
                  if (!p) {
                    const any = cycle.monthlyPrices.filter((mp) => mp.fiber.code === code)
                    if (any.length > 1) return `×${any.length}`
                    if (any.length === 1) return any[0].price ? `$${Number(any[0].price)}` : "—"
                    return "—"
                  }
                  return p.price ? `$${Number(p.price)}` : "—"
                }
                return (
                  <tr key={cycle.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {cycle.onHold && (
                        <span className="mr-1 text-amber-500">⚠</span>
                      )}
                      {cycle.market.name}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {cycle.market.region.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priceStatusStyle[cycle.priceStatus] ?? "bg-gray-100 text-gray-600"}`}>
                        {cycle.priceStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {cycle.commStatus.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {cycle.cycleStatus.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{getPrice("BKP")}</td>
                    <td className="px-4 py-3 font-mono text-xs">{getPrice("EKP")}</td>
                    <td className="px-4 py-3 font-mono text-xs">{getPrice("UKP")}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/markets/${cycle.market.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}