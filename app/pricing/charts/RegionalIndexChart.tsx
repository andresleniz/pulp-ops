"use client"

import { useState, useCallback } from "react"
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
  "#be185d", // pink
]

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

/** Format a date key (YYYY-MM or YYYY-MM-DD) → "Apr '24" */
function formatDateKey(key: string): string {
  const [y, m] = key.slice(0, 7).split("-").map(Number)
  return `${MONTH_ABBR[m - 1]} '${String(y).slice(2)}`
}

/**
 * Derive quarterly x-axis ticks from a sorted date array.
 * Keeps only the first data point per quarter month (Jan/Apr/Jul/Oct),
 * deduplicated by YYYY-MM so weekly multi-point months show exactly one tick.
 */
function deriveQuarterTicks(dates: string[]): string[] {
  const seen = new Set<string>()
  return dates.filter((d) => {
    const m = parseInt(d.slice(5, 7), 10)
    if (m !== 1 && m !== 4 && m !== 7 && m !== 10) return false
    const ym = d.slice(0, 7)
    if (seen.has(ym)) return false
    seen.add(ym)
    return true
  })
}

// ── Custom legend with click-to-highlight ────────────────────────────────────

type LegendPayloadItem = {
  value: string
  color: string
  type?: string
}

function ClickableLegend({
  payload,
  activeSeries,
  onToggle,
}: {
  payload?: LegendPayloadItem[]
  activeSeries: string | null
  onToggle: (label: string) => void
}) {
  if (!payload?.length) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 justify-center pt-2 list-none m-0 p-0">
      {payload.map((entry) => {
        const isActive = activeSeries === null || activeSeries === entry.value
        return (
          <li
            key={entry.value}
            onClick={() => onToggle(entry.value)}
            className="flex items-center gap-1.5 cursor-pointer select-none"
            style={{ opacity: isActive ? 1 : 0.3 }}
          >
            {/* plainline icon */}
            <svg width="16" height="3" aria-hidden>
              <line
                x1="0" y1="1.5" x2="16" y2="1.5"
                stroke={entry.color}
                strokeWidth={activeSeries === entry.value ? 3 : 1.75}
              />
            </svg>
            <span
              style={{
                fontSize: 11,
                fontWeight: activeSeries === entry.value ? 600 : 400,
                color: activeSeries === entry.value ? entry.color : "#6b7280",
              }}
            >
              {entry.value}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ── Main chart component ──────────────────────────────────────────────────────

export default function RegionalIndexChart({ region }: { region: RegionalChartData }) {
  const [activeSeries, setActiveSeries] = useState<string | null>(null)

  const handleToggle = useCallback((label: string) => {
    setActiveSeries((prev) => (prev === label ? null : label))
  }, [])

  const activeSeries_ = region.series.filter((s) => s.hasData)

  // Merge all date keys across active series into a sorted deduplicated array
  const dateSet = new Set<string>()
  for (const s of activeSeries_) {
    s.points.forEach((p) => dateSet.add(p.date))
  }
  const dates = [...dateSet].sort()
  const quarterTicks = deriveQuarterTicks(dates)

  // Build flat chart data: { date, "Series Label": value?, ... }
  const chartData = dates.map((date) => {
    const row: Record<string, string | number> = { date }
    for (const s of activeSeries_) {
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
            <span className="text-xs text-gray-400 tabular-nums">{dateRangeLabel}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {activeSeries_.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-6">No observed data in this window.</p>
        ) : (
          <ResponsiveContainer width="100%" height={270}>
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              onClick={(payload: any) => {
                // Click on chart canvas: toggle the nearest series via activePayload
                const activeLabel = payload?.activePayload?.[0]?.name as string | undefined
                if (activeLabel) handleToggle(activeLabel)
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickFormatter={formatDateKey}
                ticks={quarterTicks}
                interval={0}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                width={44}
                tickFormatter={(v) => `$${Math.round(v)}`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => {
                  const n = typeof value === "number" ? value : Number(value)
                  return [
                    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    undefined,
                  ] as [string, undefined]
                }}
                labelFormatter={(label) => formatDateKey(String(label))}
                contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb" }}
                itemStyle={{ padding: "1px 0" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                content={
                  <ClickableLegend
                    activeSeries={activeSeries}
                    onToggle={handleToggle}
                  />
                }
              />
              {activeSeries_.map((s, i) => {
                const color = SERIES_COLORS[i % SERIES_COLORS.length]
                const isActive = activeSeries === null || activeSeries === s.label
                return (
                  <Line
                    key={s.label}
                    type="monotone"
                    dataKey={s.label}
                    stroke={color}
                    strokeWidth={activeSeries === s.label ? 2.5 : 1.75}
                    strokeOpacity={isActive ? 1 : 0.15}
                    dot={false}
                    activeDot={
                      isActive
                        ? {
                            r: 3,
                            strokeWidth: 0,
                            onClick: () => handleToggle(s.label),
                          }
                        : false
                    }
                    connectNulls
                    style={{ cursor: "pointer" }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
