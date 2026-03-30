"use client"

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { useState } from "react"

const COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706",
  "#7c3aed", "#0891b2", "#be185d", "#65a30d",
  "#ea580c", "#0284c7", "#7c2d12", "#166534",
  "#1d4ed8", "#15803d", "#b91c1c", "#b45309",
]

interface Props {
  data: Record<string, string | number | null>[]
  customers: string[]
  title: string
  subtitle: string
  domain?: [number, number]
}

export function USALineChart({ data, customers, title, subtitle, domain = [400, 800] }: Props) {
  const [highlighted, setHighlighted] = useState<string | null>(null)

  if (data.length === 0 || customers.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No data available
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-0.5 uppercase tracking-wide">
        {title}
      </p>
      <p className="text-xs text-gray-400 mb-3">{subtitle}</p>
      {highlighted && (
        <p className="text-xs font-medium text-blue-600 mb-2">
          Highlighting: {highlighted} — click legend or line to clear
        </p>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            domain={domain}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
            contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb" }}
            itemSorter={(item) => -(item.value as number)}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            onClick={(e) => setHighlighted(
  highlighted === e.value ? null : (e.value ?? null)
)}
            formatter={(value) => (
              <span style={{
                fontWeight: highlighted === value ? 700 : 400,
                color: highlighted === value ? "#1d4ed8" : "#6b7280",
                cursor: "pointer",
              }}>
                {value}
              </span>
            )}
          />
          {customers.map((name, i) => {
            const isHighlighted = highlighted === name
            const isDimmed = highlighted !== null && !isHighlighted
            return (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={isHighlighted ? 3 : isDimmed ? 1 : 2}
                strokeOpacity={isDimmed ? 0.2 : 1}
                dot={isHighlighted ? { r: 4 } : isDimmed ? false : { r: 2 }}
                connectNulls={false}
                activeDot={{
                  r: 6,
                  onClick: () => setHighlighted((prev) => prev === name ? null : name),
                }}
                onClick={() => setHighlighted((prev) => prev === name ? null : name)}
                style={{ cursor: "pointer" }}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}