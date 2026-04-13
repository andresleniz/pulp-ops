export const dynamic = "force-dynamic"

import { Card, CardContent } from "@/components/ui/card"
import { getAllPendingTasks } from "@/lib/market-tasks"
import { completeTaskAction } from "./actions"

export default async function TasksPage() {
  const tasks = await getAllPendingTasks()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-sm text-gray-500 mt-1">
          {tasks.length} pending across all markets
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium">Task</th>
                <th className="text-left px-4 py-3 font-medium">Market</th>
                <th className="text-left px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {task.title}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{task.marketName}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                    {task.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    <form action={completeTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <button
                        type="submit"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Done
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-gray-400 text-sm"
                  >
                    No pending tasks — add tasks from the market pages.
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
