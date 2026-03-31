"use client"

import dynamic from "next/dynamic"
import type { ChartGroup } from "./IndexCharts"

const IndexCharts = dynamic(() => import("./IndexCharts"), { ssr: false })

export default function IndexChartsClient({ groups }: { groups: ChartGroup[] }) {
  return <IndexCharts groups={groups} />
}
