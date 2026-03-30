import { prisma } from "@/lib/prisma"
import { saveIndexValue, triggerRecalculate } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function IndexesPage() {
  const definitions = await prisma.indexDefinition.findMany({
    include: { values: { orderBy: { month: "desc" }, take: 12 } },
    orderBy: { name: "asc" },
  })

  const dependentMarkets = await prisma.pricingRule.findMany({
    where: { method: "index_formula", isActive: true },
    include: { market: true, fiber: true },
    distinct: ["marketId", "fiberId"],
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Market Indexes</h1>
        <p className="text-sm text-gray-500 mt-1">
          PIX China and TTO — used for formula-based pricing
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          {definitions.map((def) => (
            <Card key={def.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{def.name}</CardTitle>
                  <span className="text-xs text-gray-400">{def.unit}</span>
                </div>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b">
                      <th className="text-left pb-2 font-medium">Month</th>
                      <th className="text-right pb-2 font-medium">Value</th>
                      <th className="text-right pb-2 font-medium">Published</th>
                      <th className="text-right pb-2 font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {def.values.map((v, i) => {
                      const prev = def.values[i + 1]
                      const change = prev
                        ? Number(v.value) - Number(prev.value)
                        : null
                      return (
                        <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 font-mono text-xs">{v.month}</td>
                          <td className="py-2 text-right font-semibold">
                            {Number(v.value).toFixed(0)}
                          </td>
                          <td className="py-2 text-right text-gray-400 text-xs">
                            {v.publicationDate?.toISOString().slice(0, 10) ?? "—"}
                          </td>
                          <td className={`py-2 text-right text-xs font-medium ${change === null ? "text-gray-400" : change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-gray-400"}`}>
                            {change === null
                              ? "—"
                              : change > 0
                              ? `+${change}`
                              : String(change)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add / Update Index</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveIndexValue} className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Index</label>
                  <select
                    name="indexId"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white"
                  >
                    {definitions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Month (YYYY-MM)
                  </label>
                  <input
                    type="month"
                    name="month"
                    defaultValue="2025-04"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Value (USD/ADT)
                  </label>
                  <input
                    type="number"
                    name="value"
                    step="0.01"
                    placeholder="e.g. 630"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Publication Date
                  </label>
                  <input
                    type="date"
                    name="publicationDate"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-gray-900 text-white text-sm py-2 rounded-md hover:bg-gray-700 transition-colors"
                >
                  Save Index Value
                </button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Recalculate Prices</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={triggerRecalculate} className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Month</label>
                  <input
                    type="month"
                    name="month"
                    defaultValue="2025-04"
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white text-sm py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  ↻ Recalculate All Markets
                </button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Formula Dependencies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dependentMarkets.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-gray-700">{r.market.name}</span>
                    <span className="text-gray-400">{r.fiber.code}</span>
                    <span className="font-mono text-gray-500 ml-auto">
                      {r.formulaExpression}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}