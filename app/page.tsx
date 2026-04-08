import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createNextMonthCycles } from "./actions"
import { DashboardMonthSelector } from "@/components/dashboard/month-selector"
import { getAllPendingTasks } from "@/lib/market-tasks"
import { getDashboardIndexSnapshot, sortByDisplayOrder } from "@/lib/dashboard-queries"

function statusColor(status: string) {
  const map: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-700",
    negotiating: "bg-amber-100 text-amber-800",
    decided: "bg-green-100 text-green-800",
    revised: "bg-blue-100 text-blue-800",
    pending: "bg-red-100 text-red-700",
    drafted: "bg-amber-100 text-amber-800",
    sent: "bg-blue-100 text-blue-800",
    confirmed: "bg-green-100 text-green-800",
    not_needed: "bg-gray-100 text-gray-600",
    open: "bg-gray-100 text-gray-700",
    in_progress: "bg-amber-100 text-amber-800",
    awaiting_confirmation: "bg-blue-100 text-blue-800",
    closed: "bg-green-100 text-green-800",
    on_hold: "bg-gray-200 text-gray-600",
  }
  return map[status] ?? "bg-gray-100 text-gray-700"
}

function getNextMonth(current: string): string {
  const [y, m] = current.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: monthParam } = await searchParams

  // Find all months that have cycles so the selector only shows real months
  const availableMonths = await prisma.monthlyCycle.findMany({
    select: { month: true },
    distinct: ["month"],
    orderBy: { month: "desc" },
  })
  const months = availableMonths.map((c) => c.month)

  const CURRENT_MONTH = monthParam && months.includes(monthParam)
    ? monthParam
    : months[0] ?? "2026-04"

  const nextMonth = getNextMonth(CURRENT_MONTH)
  const nextMonthExists = months.includes(nextMonth)

  const [cyclesRaw, pendingTasks, indexes] = await Promise.all([
    prisma.monthlyCycle.findMany({
      where: { month: CURRENT_MONTH },
      include: {
        market: { include: { region: true } },
        monthlyPrices: { include: { fiber: true, mill: true } },
      },
    }),
    getAllPendingTasks(),
    getDashboardIndexSnapshot(CURRENT_MONTH),
  ])

  // Apply fixed business-priority market ordering
  const cycles = sortByDisplayOrder(cyclesRaw)

  const decided = cycles.filter(
    (c) => c.priceStatus === "decided" || c.priceStatus === "revised"
  ).length

  const emailsPending = await prisma.emailDraft.count({
    where: { month: CURRENT_MONTH, status: { in: ["pending", "draft_ready"] } },
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{monthLabel(CURRENT_MONTH)} — Pricing Cycle</p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardMonthSelector months={months} selected={CURRENT_MONTH} />
          {!nextMonthExists && (
            <form action={createNextMonthCycles}>
              <input type="hidden" name="currentMonth" value={CURRENT_MONTH} />
              <button
                type="submit"
                className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md hover:bg-gray-700 transition-colors whitespace-nowrap"
              >
                + Start {monthLabel(nextMonth)}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Markets Active", value: cycles.length, sub: CURRENT_MONTH },
          { label: "Prices Decided", value: `${decided}/${cycles.length}`, sub: "markets" },
          { label: "Open Tasks", value: pendingTasks.length, sub: "pending" },
          { label: "Emails Pending", value: emailsPending, sub: "to send" },
        ].map((m) => (
          <Card key={m.label} className="bg-gray-50 border-gray-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500 mb-1">{m.label}</p>
              <p className="text-3xl font-semibold text-gray-900">{m.value}</p>
              <p className="text-xs text-gray-400 mt-1">{m.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Market Status — {monthLabel(CURRENT_MONTH)}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {cycles.map((cycle) => {
              const prices = cycle.monthlyPrices
              const isUSA = cycle.market.name === "USA"

              const done = [
                ["decided", "revised"].includes(cycle.priceStatus),
                ["sent", "confirmed"].includes(cycle.commStatus),
                cycle.cycleStatus === "closed",
              ]
              const active = [
                cycle.priceStatus === "negotiating",
                ["pending", "drafted"].includes(cycle.commStatus),
                cycle.cycleStatus === "awaiting_confirmation",
              ]

              return (
                <Link key={cycle.id} href={`/markets/${cycle.market.id}?month=${CURRENT_MONTH}`}>
                  <Card className={`cursor-pointer hover:border-gray-400 transition-colors ${cycle.onHold ? "opacity-70 bg-amber-50 border-amber-200" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{cycle.market.name}</p>
                          <p className="text-xs text-gray-400">{cycle.market.region.name}</p>
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(cycle.priceStatus)}`}>
                            {cycle.priceStatus.replace("_", " ")}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(cycle.commStatus)}`}>
                            {cycle.commStatus.replace("_", " ")}
                          </span>
                        </div>
                      </div>

                      {cycle.onHold && (
                        <div className="text-xs bg-amber-100 text-amber-800 rounded px-2 py-1 mb-2">
                          On Hold — {cycle.holdReason}
                        </div>
                      )}

                      {isUSA ? (
                        <div className="flex gap-2 flex-wrap mb-2">
                          {prices
                            .filter((p) => p.mill !== null && p.price !== null)
                            .slice(0, 4)
                            .map((p) => (
                              <div key={p.id} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5">
                                <span className="text-xs text-gray-500">{p.fiber.code}</span>
                                <span className="text-xs text-gray-400">{p.mill?.name}</span>
                                <span className="text-xs font-medium text-gray-900">
                                  {p.price != null ? `$${Number(p.price)}` : "—"}
                                </span>
                              </div>
                            ))}
                          {prices.filter((p) => p.mill !== null).length > 4 && (
                            <div className="flex items-center bg-gray-100 rounded px-2 py-0.5">
                              <span className="text-xs text-gray-400">
                                +{prices.filter((p) => p.mill !== null).length - 4} more
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex gap-2 flex-wrap mb-2">
                          {["BKP", "EKP", "UKP"].map((code) => {
                            const fiberPrices = prices.filter((p) => p.fiber.code === code)
                            if (fiberPrices.length === 0) return null
                            const topPrice = fiberPrices[0]
                            return (
                              <div key={code} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5">
                                <span className="text-xs text-gray-500">{code}</span>
                                <span className="text-xs font-medium text-gray-900">
                                  {topPrice?.price != null && !isNaN(Number(topPrice.price))
                                    ? `$${Number(topPrice.price)}`
                                    : "—"}
                                </span>
                                {fiberPrices.length > 1 && (
                                  <span className="text-xs text-gray-400">×{fiberPrices.length}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <div className="flex gap-0.5 h-1.5 mt-2">
                        {done.map((isDone, i) => (
                          <div
                            key={i}
                            className={`flex-1 rounded-sm ${isDone ? "bg-green-500" : active[i] ? "bg-amber-400" : "bg-gray-200"}`}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-gray-700">Open Tasks</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {pendingTasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="flex items-start gap-2">
                    <div className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0 bg-amber-400" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-800 leading-snug truncate">{task.title}</p>
                      <p className="text-xs text-gray-400">
                        {task.marketName}{task.month ? ` · ${task.month}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
                {pendingTasks.length === 0 && <p className="text-xs text-gray-400">No open tasks.</p>}
              </div>
              {pendingTasks.length > 6 && (
                <p className="text-xs text-gray-400 mt-2">+{pendingTasks.length - 6} more tasks across markets</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-gray-700">Index Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {indexes.map((idx) => (
                <div key={idx.display} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-xs text-gray-700">{idx.display}</span>
                  {idx.value !== null ? (
                    <div className="text-right">
                      <span className="text-sm font-medium">${idx.value}</span>
                      <span className="text-xs text-gray-400 ml-1">USD/ADT</span>
                      {!idx.isCurrentMonth && idx.month && (
                        <span className="text-xs text-amber-500 ml-1">({idx.month})</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </div>
              ))}
              <Link href="/indexes" className="text-xs text-blue-600 mt-2 block">
                Manage indexes →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
