import { prisma } from "@/lib/prisma"
import { saveIndexValue, triggerRecalculate } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import IndexUploader from "./IndexUploader"
import IndexesCanvas from "./IndexesCanvas"
import { getLayout } from "@/lib/page-layout"
import { indexWidgetKey } from "@/lib/widget-catalog"
import type { IndexSeriesData } from "./IndexesCanvas"

// ── Trailing-12-month window helper ──────────────────────────────────────────

/**
 * Given a month key (YYYY-MM or YYYY-MM-DD), returns the YYYY-MM string that
 * is 11 months earlier — so [start, end] inclusive spans exactly 12 months.
 */
function trailingStartMonth(endMonthKey: string): string {
  const base = endMonthKey.slice(0, 7)
  const [y, m] = base.split("-").map(Number)
  const startM = m - 11
  const startY = startM <= 0 ? y - 1 : y
  const normM = startM <= 0 ? 12 + startM : startM
  return `${startY}-${String(normM).padStart(2, "0")}`
}

export default async function IndexesPage() {
  const layout = await getLayout("indexes")

  // ── Fetch per-series trailing-12-month data ───────────────────────────────
  const definitions = await prisma.indexDefinition.findMany({
    orderBy: { name: "asc" },
  })

  const allDefs: IndexSeriesData[] = []

  for (const def of definitions) {
    // Find latest non-forecast observation to anchor the 12-month window
    const latest = await prisma.indexValue.findFirst({
      where: { indexId: def.id, NOT: { source: "forecast" } },
      orderBy: { month: "desc" },
    })

    if (!latest) {
      allDefs.push({ id: def.id, name: def.name, unit: def.unit, values: [] })
      continue
    }

    const startMonth = trailingStartMonth(latest.month)

    const values = await prisma.indexValue.findMany({
      where: {
        indexId: def.id,
        NOT: { source: "forecast" },
        month: { gte: startMonth },
      },
      orderBy: { month: "asc" },
    })

    allDefs.push({
      id: def.id,
      name: def.name,
      unit: def.unit,
      values: values.map((v) => ({
        id: v.id,
        month: v.month,
        value: Number(v.value),
        publicationDate: v.publicationDate?.toISOString().slice(0, 10) ?? null,
      })),
    })
  }

  // Map layout keys → canonical idx:name, drop any stale keys
  const canonicalLayout = layout.filter((key) =>
    allDefs.some((d) => indexWidgetKey(d.name) === key)
  )

  const dependentMarkets = await prisma.pricingRule.findMany({
    where: { method: "index_formula", isActive: true },
    include: { market: true, fiber: true },
    distinct: ["marketId", "fiberId"],
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Indexes & Charts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Fastmarkets, PIX, RISI — latest 12 months per series
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main canvas — 2/3 width */}
        <div className="col-span-2">
          <IndexesCanvas initialLayout={canonicalLayout} allDefs={allDefs} />
        </div>

        {/* Tools sidebar — 1/3 width */}
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
                    defaultValue="2026-04"
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
                    defaultValue="2026-04"
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

          <IndexUploader />

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
