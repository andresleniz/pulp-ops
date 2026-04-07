"use client"

import { useTransition, useRef, useState } from "react"
import { addMarketTask, toggleMarketTask } from "@/app/markets/[id]/task-actions"
import type { MarketTaskStatus } from "@prisma/client"

type Task = {
  id: string
  title: string
  status: MarketTaskStatus
}

export function MarketTasksPanel({
  marketId,
  month,
  cycleId,
  initialTasks,
}: {
  marketId: string
  month: string
  cycleId: string | null
  initialTasks: Task[]
}) {
  const [isPending, startTransition] = useTransition()
  const [showDone, setShowDone] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const pending = initialTasks.filter((t) => t.status === "pending")
  const done = initialTasks.filter((t) => t.status === "done")

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      await addMarketTask(formData)
      formRef.current?.reset()
    })
  }

  function handleToggle(task: Task) {
    const next: MarketTaskStatus = task.status === "pending" ? "done" : "pending"
    startTransition(() => toggleMarketTask(task.id, next, marketId))
  }

  return (
    <div className="space-y-3">
      {/* Pending tasks */}
      {pending.length === 0 ? (
        <p className="text-xs text-gray-400">No pending tasks.</p>
      ) : (
        <ul className="space-y-1.5">
          {pending.map((task) => (
            <li
              key={task.id}
              className="flex items-start gap-2 text-xs"
            >
              <button
                onClick={() => handleToggle(task)}
                disabled={isPending}
                className="mt-0.5 w-4 h-4 rounded border border-gray-300 flex-shrink-0 hover:border-green-500 hover:bg-green-50 transition-colors"
                title="Mark done"
              />
              <span className="text-gray-800 leading-snug">{task.title}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Completed tasks toggle */}
      {done.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {showDone ? "Hide" : "Show"} completed ({done.length})
          </button>
          {showDone && (
            <ul className="mt-1.5 space-y-1.5">
              {done.map((task) => (
                <li key={task.id} className="flex items-start gap-2 text-xs">
                  <button
                    onClick={() => handleToggle(task)}
                    disabled={isPending}
                    className="mt-0.5 w-4 h-4 rounded border border-green-400 bg-green-100 flex-shrink-0 hover:bg-white transition-colors"
                    title="Mark pending"
                  >
                    <span className="block w-full h-full flex items-center justify-center text-green-600 text-xs leading-none">✓</span>
                  </button>
                  <span className="text-gray-400 line-through leading-snug">{task.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add task form */}
      <form
        ref={formRef}
        action={handleAdd}
        className="flex gap-1.5 pt-2 border-t border-gray-100"
      >
        <input type="hidden" name="marketId" value={marketId} />
        <input type="hidden" name="month" value={month} />
        {cycleId && <input type="hidden" name="cycleId" value={cycleId} />}
        <input
          name="title"
          type="text"
          placeholder="New task…"
          required
          className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={isPending}
          className="bg-gray-800 text-white text-xs px-2.5 py-1 rounded hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </div>
  )
}
