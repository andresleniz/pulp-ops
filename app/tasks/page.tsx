import { prisma } from "@/lib/prisma"
import { resolveTaskAction, generateTasksAction } from "./actions"
import { Card, CardContent } from "@/components/ui/card"

const CURRENT_MONTH = "2026-03"

const priorityDot: Record<string, string> = {
  high: "bg-red-500",
  med: "bg-amber-400",
  low: "bg-gray-300",
}

const typeLabel: Record<string, string> = {
  missing_price: "Missing Price",
  missing_index: "Missing Index",
  pending_announcement: "Pending Announcement",
  pending_confirmation: "Pending Confirmation",
  hold_review: "Hold Review",
  negotiation_followup: "Negotiation Follow-up",
}

const statusStyle: Record<string, string> = {
  open: "bg-red-50 text-red-700",
  in_progress: "bg-amber-50 text-amber-700",
  resolved: "bg-green-50 text-green-700",
  dismissed: "bg-gray-100 text-gray-500",
}

export default async function TasksPage() {
  const tasks = await prisma.task.findMany({
    where: { month: CURRENT_MONTH },
    include: { cycle: { include: { market: true } } },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
  })

  const open = tasks.filter(
    (t) => t.status === "open" || t.status === "in_progress"
  )
  const resolved = tasks.filter(
    (t) => t.status === "resolved" || t.status === "dismissed"
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">
            {open.length} open · {resolved.length} resolved
          </p>
        </div>
        <form action={generateTasksAction}>
          <input type="hidden" name="month" value={CURRENT_MONTH} />
          <button
            type="submit"
            className="bg-gray-100 text-gray-700 text-sm px-4 py-2 rounded-md hover:bg-gray-200 transition-colors border border-gray-200"
          >
            ↻ Refresh Tasks
          </button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium">Priority</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Market</th>
                <th className="text-left px-4 py-3 font-medium">Due</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${priorityDot[task.priority]}`} />
                      <span className="text-xs text-gray-500 capitalize">
                        {task.priority}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {typeLabel[task.type] ?? task.type}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {task.cycle?.market.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                    {task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle[task.status]}`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                    {task.notes}
                  </td>
                  <td className="px-4 py-3">
                    {(task.status === "open" || task.status === "in_progress") && (
                      <form action={resolveTaskAction}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <button
                          type="submit"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Resolve
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-400 text-sm"
                  >
                    No tasks for {CURRENT_MONTH}. Click Refresh Tasks to generate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}