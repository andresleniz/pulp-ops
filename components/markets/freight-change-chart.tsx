"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, Cell, ResponsiveContainer,
} from "recharts"

const COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706",
  "#7c3aed", "#0891b2", "#be185d", "#65a30d",
  "#ea580c", "#0284c7",
]

const THRESHOLD = 5

interface Props {
  data: Record<string, string | number | null>[]
  locations: string[]
}

function getBarFill(value: number | null, baseColor: string): string {
  if (value === null) return "transparent"
  if (value > THRESHOLD) return "#dc2626"
  if (value < -THRESHOLD) return "#16a34a"
  return baseColor
}

export function FreightChangeChart({ data, locations }: Props) {
  if (data.length === 0 || locations.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No significant freight changes (±5%) in last 12 months
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-0.5 uppercase tracking-wide">
        Freight change — month over month
      </p>
      <p className="text-xs text-gray-400 mb-1">
        Locations with at least one move &gt;5% — bars outside the band are red (up) or green (down)
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
          />
          <Tooltip
            formatter={(value, name) => {
              const n = Number(value)
              return [`${n > 0 ? "+" : ""}${n.toFixed(1)}%`, name]
            }}
            contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <ReferenceLine y={THRESHOLD} stroke="#fca5a5" strokeDasharray="4 2" label={{ value: "+5%", fontSize: 10, fill: "#dc2626", position: "right" }} />
          <ReferenceLine y={-THRESHOLD} stroke="#86efac" strokeDasharray="4 2" label={{ value: "-5%", fontSize: 10, fill: "#16a34a", position: "right" }} />
          <ReferenceLine y={0} stroke="#e5e7eb" />
          {locations.map((loc, i) => (
            <Bar key={loc} dataKey={loc} fill={COLORS[i % COLORS.length]} maxBarSize={18}>
              {data.map((entry, j) => {
                const v = entry[loc] as number | null
                return (
                  <Cell
                    key={j}
                    fill={getBarFill(v, COLORS[i % COLORS.length])}
                  />
                )
              })}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
