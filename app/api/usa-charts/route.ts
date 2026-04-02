import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { CRM_FILTER } from "@/lib/order-queries"

function getLastMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    months.push(`${y}-${m}`)
  }
  return months
}

const CUSTOMER_NORMALIZE: Record<string, string> = {
  "atlas": "Atlas", "atlas - smart": "Atlas", "atlas - smart whse": "Atlas",
  "atlas paper": "Atlas", "atlas paper mill": "Atlas", "atlas paper mills": "Atlas",
  "atlas southeast": "Atlas", "atlas southeast (smart whse)": "Atlas",
  "atlas southeast - smart whse": "Atlas", "atlas southeast papers": "Atlas",
  "biorigin": "BiOrigin", "biOrign": "BiOrigin", "biOrign ": "BiOrigin",
  "gp": "Georgia Pacific", "georgia pacific": "Georgia Pacific",
  "georgia pacific (wauna)": "Georgia Pacific",
  "omnia": "Omnia", "omnia advanced materials": "Omnia", "omnia c/o castorland": "Omnia",
  "royal": "Royal Paper", "royal paper": "Royal Paper",
  "sapp na c/o  lsw": "Sappi", "sapp na c/o lsw": "Sappi",
  "sappi": "Sappi", "sappi na/nepw": "Sappi",
  "seaman": "Seaman", "seaman paper": "Seaman",
  "twin rivers": "Twin Rivers", "twin rivers (oneida whse)": "Twin Rivers",
  "twin rivers/fdc": "Twin Rivers", "twin rivers/grand prix": "Twin Rivers",
  "twin rivers/lfdc": "Twin Rivers", "twin rivers/oneida": "Twin Rivers",
  "twin rives/lfdc": "Twin Rivers",
  "neenah": "Neenah", "neenah paper": "Neenah",
  "barnwell": "Barnwell", "barnwell tissue": "Barnwell",
  "kruger": "Kruger", "kruger sherbrooke": "Kruger",
}

const EXCLUDE = new Set([
  "james hardie", "arauco north america, inc.",
  "arauco north america inc", "arauco north america",
])

const MIN_VOLUME = 500

function normalizeName(name: string): string {
  const key = name.trim().toLowerCase()
  return CUSTOMER_NORMALIZE[key] ?? name.trim()
}

function extractBase(fullName: string): string {
  const base = fullName.split(" — ")[0].trim()
  return normalizeName(base)
}

interface WeightedEntry {
  priceVolume: number
  freightVolume: number
  volume: number
  hasFreight: boolean
}

export async function GET() {
  try {
    const ALL_MONTHS = getLastMonths(12)

    const usaMarket = await prisma.market.findUnique({ where: { name: "USA" } })
    if (!usaMarket) {
      return NextResponse.json({ error: "USA market not found" }, { status: 404 })
    }

    const cycles = await prisma.monthlyCycle.findMany({
      where: { marketId: usaMarket.id },
      select: { id: true, month: true },
    })

    const cycleIds = cycles.map((c) => c.id)

    const orders = await prisma.orderRecord.findMany({
      where: {
        ...CRM_FILTER,
        cycleId: { in: cycleIds },
        month: { in: ALL_MONTHS },
      },
      select: {
        month: true,
        price: true,
        freightPerAdmt: true,
        volume: true,
        customerId: true,
      },
      orderBy: { month: "asc" },
    })

    const customerIds = [...new Set(orders.map((o) => o.customerId))]
    const customerRecords = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true },
    })

    // Two maps: one for normalized base name, one for full location label
    const customerBaseMap: Record<string, string> = {}
    const customerLocationMap: Record<string, string> = {}
    for (const c of customerRecords) {
      customerBaseMap[c.id] = extractBase(c.name)
      // Keep full name as location label (e.g. "BiOrigin — Wiggins MS")
      customerLocationMap[c.id] = c.name
    }

    // --- CHART 1 & 2: Price and Net Back — weighted avg per customer ---

    const totalVolume: Record<string, number> = {}
    for (const order of orders) {
      if (!order.price || !order.volume) continue
      const name = customerBaseMap[order.customerId]
      if (!name || EXCLUDE.has(name.toLowerCase())) continue
      totalVolume[name] = (totalVolume[name] ?? 0) + Number(order.volume)
    }

    const customerNames = Object.entries(totalVolume)
      .filter(([, vol]) => vol >= MIN_VOLUME)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    const dataMap: Record<string, Record<string, WeightedEntry>> = {}
    for (const month of ALL_MONTHS) {
      dataMap[month] = {}
      for (const name of customerNames) {
        dataMap[month][name] = { priceVolume: 0, freightVolume: 0, volume: 0, hasFreight: false }
      }
    }

    for (const order of orders) {
      if (!order.price || !order.volume) continue
      const name = customerBaseMap[order.customerId]
      if (!name || EXCLUDE.has(name.toLowerCase())) continue
      if (!customerNames.includes(name)) continue
      const month = order.month
      if (!dataMap[month]) continue

      const price = Number(order.price)
      const vol = Number(order.volume)
      const freight = order.freightPerAdmt ? Number(order.freightPerAdmt) : null

      dataMap[month][name].priceVolume += price * vol
      dataMap[month][name].volume += vol
      if (freight !== null) {
        dataMap[month][name].freightVolume += freight * vol
        dataMap[month][name].hasFreight = true
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100

    const toWeightedChartData = (mode: "price" | "netback") =>
      ALL_MONTHS.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        for (const name of customerNames) {
          const entry = dataMap[m]?.[name]
          if (!entry || entry.volume === 0) { point[name] = null; continue }
          const wavgPrice = round2(entry.priceVolume / entry.volume)
          const wavgFreight = entry.hasFreight ? round2(entry.freightVolume / entry.volume) : null
          if (mode === "price") point[name] = wavgPrice
          else point[name] = wavgFreight !== null ? round2(wavgPrice - wavgFreight) : wavgPrice
        }
        return point
      })

    // --- CHART 3: Freight per location ---

    // Get locations that have freight data and enough volume
    const locationVolume: Record<string, number> = {}
    for (const order of orders) {
      if (!order.freightPerAdmt || !order.volume) continue
      const base = customerBaseMap[order.customerId]
      if (!base || EXCLUDE.has(base.toLowerCase())) continue
      const loc = customerLocationMap[order.customerId]
      locationVolume[loc] = (locationVolume[loc] ?? 0) + Number(order.volume)
    }

    const locationNames = Object.entries(locationVolume)
      .filter(([, vol]) => vol >= MIN_VOLUME)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    const freightByLocation: Record<string, Record<string, WeightedEntry>> = {}
    for (const month of ALL_MONTHS) {
      freightByLocation[month] = {}
      for (const loc of locationNames) {
        freightByLocation[month][loc] = { priceVolume: 0, freightVolume: 0, volume: 0, hasFreight: false }
      }
    }

    for (const order of orders) {
      if (!order.freightPerAdmt || !order.volume) continue
      const base = customerBaseMap[order.customerId]
      if (!base || EXCLUDE.has(base.toLowerCase())) continue
      const loc = customerLocationMap[order.customerId]
      if (!locationNames.includes(loc)) continue
      const month = order.month
      if (!freightByLocation[month]) continue

      freightByLocation[month][loc].freightVolume += Number(order.freightPerAdmt) * Number(order.volume)
      freightByLocation[month][loc].volume += Number(order.volume)
      freightByLocation[month][loc].hasFreight = true
    }

    // MoM freight % change — skip first month (no previous to compare)
    const freightChangeData = ALL_MONTHS.slice(1).map((m, idx) => {
      const prevMonth = ALL_MONTHS[idx]
      const point: Record<string, string | number | null> = { month: m.slice(2) }
      for (const loc of locationNames) {
        const curr = freightByLocation[m]?.[loc]
        const prev = freightByLocation[prevMonth]?.[loc]
        if (!curr || curr.volume === 0 || !prev || prev.volume === 0) {
          point[loc] = null; continue
        }
        const currF = curr.freightVolume / curr.volume
        const prevF = prev.freightVolume / prev.volume
        if (prevF === 0) { point[loc] = null; continue }
        point[loc] = round2(((currF - prevF) / prevF) * 100)
      }
      return point
    })

    // Only expose locations that crossed ±5% at least once
    const significantLocations = locationNames.filter((loc) =>
      freightChangeData.some((pt) => {
        const v = pt[loc]
        return typeof v === "number" && Math.abs(v) > 5
      })
    )

    return NextResponse.json({
      customers: customerNames,
      priceData: toWeightedChartData("price"),
      netbackData: toWeightedChartData("netback"),
      freightChangeData,
      significantLocations,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}