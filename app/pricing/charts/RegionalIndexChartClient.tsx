"use client"

import dynamic from "next/dynamic"
import type { RegionalChartData } from "@/lib/indexes-chart-queries"

const RegionalIndexChart = dynamic(() => import("./RegionalIndexChart"), { ssr: false })

export default function RegionalIndexChartClient({ region }: { region: RegionalChartData }) {
  return <RegionalIndexChart region={region} />
}
