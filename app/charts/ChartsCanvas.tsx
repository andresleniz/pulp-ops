"use client"

import { useState, useRef } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import type { ChartGroup } from "@/app/indexes/IndexCharts"
import type { ChartWidgetDef } from "@/lib/widget-catalog"
import IndexCharts from "@/app/indexes/IndexCharts"
import { addChartWidget, removeChartWidget, reorderChartWidgets } from "./actions"

// ── Sortable wrapper ──────────────────────────────────────────────────────────

function SortableChartCard({
  id,
  label,
  group,
  onRemove,
}: {
  id: string
  label: string
  group: ChartGroup
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to reorder"
      >
        <span className="text-gray-300 text-lg select-none">⠿</span>
      </div>
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-lg leading-none"
        title={`Remove ${label}`}
      >
        ×
      </button>
      {/* Chart rendered inside its own card via IndexCharts */}
      <div className="pl-6">
        <IndexCharts groups={[group]} />
      </div>
    </div>
  )
}

// ── Add-widget dropdown ───────────────────────────────────────────────────────

function AddWidgetMenu({
  catalog,
  activeKeys,
  onAdd,
}: {
  catalog: ChartWidgetDef[]
  activeKeys: string[]
  onAdd: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const available = catalog.filter((w) => !activeKeys.includes(w.key))

  if (available.length === 0) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 bg-gray-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors"
      >
        <span className="text-base leading-none">+</span> Add Chart
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          {available.map((w) => (
            <button
              key={w.key}
              onClick={() => {
                onAdd(w.key)
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main canvas ───────────────────────────────────────────────────────────────

export default function ChartsCanvas({
  initialLayout,
  allChartData,
  catalog,
}: {
  initialLayout: string[]
  allChartData: Record<string, ChartGroup>
  catalog: ChartWidgetDef[]
}) {
  const [items, setItems] = useState(initialLayout)
  const [pending, setPending] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIdx = prev.indexOf(String(active.id))
      const newIdx = prev.indexOf(String(over.id))
      const reordered = arrayMove(prev, oldIdx, newIdx)
      reorderChartWidgets(reordered) // fire-and-forget server action
      return reordered
    })
  }

  async function handleAdd(key: string) {
    setPending(true)
    await addChartWidget(key)
    setItems((prev) => [...prev, key])
    setPending(false)
  }

  async function handleRemove(key: string) {
    setPending(true)
    setItems((prev) => prev.filter((k) => k !== key)) // optimistic
    await removeChartWidget(key)
    setPending(false)
  }

  const labelFor = (key: string) =>
    catalog.find((w) => w.key === key)?.label ?? key

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Charts</h1>
          <p className="text-sm text-gray-500 mt-1">TTO and PIX price index history</p>
        </div>
        <AddWidgetMenu catalog={catalog} activeKeys={items} onAdd={handleAdd} />
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-base mb-1">No charts added yet</p>
          <p className="text-sm">Use Add Chart to build your layout</p>
        </div>
      )}

      {/* Sortable list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className={`space-y-0 ${pending ? "opacity-70 pointer-events-none" : ""}`}>
            {items.map((key) => {
              const group = allChartData[key]
              if (!group) return null
              return (
                <SortableChartCard
                  key={key}
                  id={key}
                  label={labelFor(key)}
                  group={group}
                  onRemove={() => handleRemove(key)}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
