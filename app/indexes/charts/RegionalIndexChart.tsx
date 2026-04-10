"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RegionalChartData } from "@/lib/indexes-chart-queries"

const SERIES_COLORS = [
  "#2563eb", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#d97706", // amber
  "#7c3aed", // purple
  "#0891b2", // cyan
]

/** Format a date key (YYYY-MM or YYYY-MM-DD) → "Apr '24" */
function formatDateKey(key: string): string {
  const part = key.slice(0, 7) // YYYY-MM
  const [y, m] = part.split("-").map(Number)
  const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]
  return `${month} '${String(y).slice(2)}`
}

/** Show only quarter-start months (Jan, Apr, Jul, Oct) as ticks */
function isQuarterStart(key: string): boolean {
  const m = parseInt(key.slice(5, 7), 10)
  return m === 1 || m === 4 || m === 7 || m === 10
}

export default function RegionalIndexChart({ region }: { region: RegionalChartData }) {
  const activeSeries = region.series.filter((s) => s.hasData)

  // Merge all date keys across series into a sorted deduplicated array
  const dateSet = new Set<string>()
  for (const s of activeSeries) {
    s.points.forEach((p) => dateSet.add(p.date))
  }
  const dates = [...dateSet].sort()

  // Build flat chart data: { date, "Series Label": value?, ... }
  const chartData = dates.map((date) => {
    const row: Record<string, string | number> = { date }
    for (const s of activeSeries) {
      const point = s.points.find((p) => p.date === date)
      if (point != null) row[s.label] = point.value
    }
    return row
  })

  const dateRangeLabel =
    region.startDate && region.endpoint
      ? `${formatDateKey(region.startDate)} – ${formatDateKey(region.endpoint)}`
      : ""

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-baseline justify-between gap-4">
          <CardTitle className="text-base font-semibold">{region.region}</CardTitle>
          {dateRangeLabel && (
            <span className="text-xs text-gray-400">{dateRangeLabel}</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {activeSeries.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4">No data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={formatDateKey}
                ticks={dates.filter(isQuarterStart)}
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                width={46}
                tickFormatter={(v) => `$${Math.round(v)}`}
              />
              <Tooltip
                formatter={(value) => {
                  const n = typeof value === "number" ? value : Number(value)
                  return [`$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, undefined] as [string, undefined]
                }}
                labelFormatter={(label) => formatDateKey(String(label))}
                contentStyle={{ fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {activeSeries.map((s, i) => (
                <Line
                  key={s.label}
                  type="monotone"
                  dataKey={s.label}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
