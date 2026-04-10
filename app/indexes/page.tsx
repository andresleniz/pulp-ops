import { prisma } from "@/lib/prisma"
import { saveIndexValue, triggerRecalculate } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import IndexUploader from "./IndexUploader"
import {
  getIndexesPageSnapshotByRegion,
  type IndexCardData,
  type RegionSnapshot,
} from "@/lib/indexes-queries"

// ── Card component ────────────────────────────────────────────────────────────

function statusBadge(status: IndexCardData["status"]) {
  if (status === "current") return "bg-green-100 text-green-800"
  if (status === "stale")   return "bg-amber-100 text-amber-800"
  return "bg-gray-100 text-gray-500"
}

function IndexCard({ card }: { card: IndexCardData }) {
  // unavailable — no FM/TTO series acquired for this concept yet.
  // Rendered with a distinct muted style so the gap is explicit, not a broken value.
  if (card.mappingType === "unavailable") {
    return (
      <Card className="bg-gray-50 border-dashed border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2 gap-2">
            <p className="text-sm font-medium text-gray-400 leading-tight">{card.label}</p>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-400">
              unavailable
            </span>
          </div>
          <p className="text-2xl font-semibold text-gray-300">—</p>
          <p className="text-xs text-gray-400 italic mt-1">No data source yet</p>
          <div className="flex flex-wrap gap-1 mt-3">
            {card.tags.map((tag) => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2 gap-2">
          <p className="text-sm font-medium text-gray-900 leading-tight">{card.label}</p>
          <span
            className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(card.status)}`}
          >
            {card.status}
          </span>
        </div>

        <p className="text-2xl font-semibold text-gray-900 tracking-tight">
          {card.value != null ? `$${card.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
        </p>

        <div className="mt-1 space-y-0.5">
          {card.observationDate && (
            <p className="text-xs text-gray-400">{card.observationDate}</p>
          )}
          {card.source && (
            <p className="text-xs text-gray-400">{card.source} · USD/ADT</p>
          )}
          {!card.observationDate && !card.source && (
            <p className="text-xs text-gray-400 italic">No data yet</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1 mt-3">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Region section ────────────────────────────────────────────────────────────

function RegionSection({ region }: { region: RegionSnapshot }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {region.region}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {region.cards.map((card) => (
          <IndexCard key={card.label} card={card} />
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function IndexesPage() {
  // Current month for snapshot window — computed server-side from UTC date
  const currentMonth = new Date().toISOString().slice(0, 7)

  const [regions, definitions, dependentMarkets] = await Promise.all([
    getIndexesPageSnapshotByRegion(currentMonth),
    prisma.indexDefinition.findMany({ orderBy: { name: "asc" } }),
    prisma.pricingRule.findMany({
      where: { method: "index_formula", isActive: true },
      include: { market: true, fiber: true },
      distinct: ["marketId", "fiberId"],
    }),
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Indexes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Fastmarkets &amp; TTO — {currentMonth}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Regional snapshot — 2/3 width */}
        <div className="col-span-2">
          {regions.map((region) => (
            <RegionSection key={region.region} region={region} />
          ))}
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
                    defaultValue={currentMonth}
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
                    defaultValue={currentMonth}
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
                {dependentMarkets.length === 0 && (
                  <p className="text-xs text-gray-400">No formula rules active.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
