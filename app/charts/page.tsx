import { prisma } from "@/lib/prisma"
import { getLayout } from "@/lib/page-layout"
import { CHART_CATALOG } from "@/lib/widget-catalog"
import type { ChartGroup } from "@/app/indexes/IndexCharts"
import ChartsCanvas from "./ChartsCanvas"

// ── Build chart group data for the given catalog entry ────────────────────────
//   Excludes forecast rows; uses last 24 non-forecast values per series.

async function buildChartGroup(
  match: { exact: string } | { prefix: string }
): Promise<ChartGroup | null> {
  const definitions = await prisma.indexDefinition.findMany({
    where:
      "exact" in match
        ? { name: match.exact }
        : { name: { startsWith: match.prefix } },
    include: {
      values: {
        where: { OR: [{ source: null }, { source: { not: "forecast" } }] },
        orderBy: { month: "desc" },
        take: 24,
      },
    },
  })

  // For weekly series, aggregate to monthly averages for clean chart display
  function toMonthlyPoints(
    values: { month: string; value: { toNumber: () => number } }[]
  ) {
    // values arrive desc (newest-first); output is sorted asc for chart display
    // month can be YYYY-MM or YYYY-MM-DD
    const byMonth = new Map<string, number[]>()
    for (const v of values) {
      const m = v.month.slice(0, 7) // YYYY-MM
      if (!byMonth.has(m)) byMonth.set(m, [])
      byMonth.get(m)!.push(v.value.toNumber())
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({
        month,
        value: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      }))
  }

  const prefix = "prefix" in match ? match.prefix : ""
  const title = "exact" in match ? match.exact : prefix.trimEnd()

  const series = definitions
    .filter((d) => d.values.length > 0)
    .map((d) => ({
      name:
        "exact" in match
          ? d.name
          : d.name.replace(prefix, "").trim() || d.name,
      data: toMonthlyPoints(d.values),
    }))

  if (series.length === 0) return null
  return { title, series }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ChartsPage() {
  const layout = await getLayout("charts")

  // Pre-compute chart data for all catalog entries (only 5, cheap)
  const allChartData: Record<string, ChartGroup> = {}
  for (const entry of CHART_CATALOG) {
    const group = await buildChartGroup(entry.match)
    if (group) allChartData[entry.key] = group
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ChartsCanvas
        initialLayout={layout}
        allChartData={allChartData}
        catalog={CHART_CATALOG}
      />
    </div>
  )
}
