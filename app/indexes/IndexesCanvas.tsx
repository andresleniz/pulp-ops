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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { addIndexWidget, removeIndexWidget, reorderIndexWidgets } from "./actions"
import { displayNameForIndex } from "@/lib/widget-catalog"
import IndexCharts from "./IndexCharts"
import type { ChartGroup } from "./IndexCharts"

// ── Types ─────────────────────────────────────────────────────────────────────

export type IndexSeriesData = {
  id: string
  name: string         // raw IndexDefinition.name
  unit: string
  values: {
    id: string
    month: string
    value: number
    publicationDate: string | null
  }[]
}

// ── Data conversion: IndexSeriesData → ChartGroup ─────────────────────────────

/**
 * Aggregates weekly observations to monthly averages (same logic as
 * the charts page) and returns a single-series ChartGroup ready for IndexCharts.
 */
function toChartGroup(def: IndexSeriesData): ChartGroup {
  const byMonth = new Map<string, number[]>()
  for (const v of def.values) {
    const m = v.month.slice(0, 7)
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m)!.push(v.value)
  }
  const data = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({
      month,
      value: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    }))

  const label = displayNameForIndex(def.name)
  return {
    title: label,
    series: [{ name: label, data }],
  }
}

// ── Sortable chart card ───────────────────────────────────────────────────────

function SortableIndexCard({
  id,
  def,
  onRemove,
}: {
  id: string
  def: IndexSeriesData
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const group = toChartGroup(def)

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

      <Card className="ml-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {displayNameForIndex(def.name)}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{def.unit}</span>
              <button
                onClick={onRemove}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-lg leading-none"
                title={`Remove ${displayNameForIndex(def.name)}`}
              >
                ×
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {group.series[0].data.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No data available</p>
          ) : (
            <IndexCharts groups={[group]} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Add-widget dropdown ───────────────────────────────────────────────────────

function AddWidgetMenu({
  allDefs,
  activeKeys,
  onAdd,
}: {
  allDefs: IndexSeriesData[]
  activeKeys: string[]
  onAdd: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const available = allDefs.filter((d) => !activeKeys.includes(`idx:${d.name}`))

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
        <div className="absolute right-0 mt-1 w-72 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          {available.map((d) => (
            <button
              key={d.name}
              onClick={() => {
                onAdd(`idx:${d.name}`)
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg border-b border-gray-50 last:border-0"
            >
              <span className="font-medium text-gray-800">
                {displayNameForIndex(d.name)}
              </span>
              {d.values.length === 0 && (
                <span className="ml-2 text-xs text-gray-400">no data</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main canvas ───────────────────────────────────────────────────────────────

export default function IndexesCanvas({
  initialLayout,
  allDefs,
}: {
  initialLayout: string[]
  allDefs: IndexSeriesData[]
}) {
  const [items, setItems] = useState(initialLayout)
  const [pending, setPending] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const defByKey = Object.fromEntries(allDefs.map((d) => [`idx:${d.name}`, d]))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIdx = prev.indexOf(String(active.id))
      const newIdx = prev.indexOf(String(over.id))
      const reordered = arrayMove(prev, oldIdx, newIdx)
      reorderIndexWidgets(reordered)
      return reordered
    })
  }

  async function handleAdd(key: string) {
    setPending(true)
    await addIndexWidget(key)
    setItems((prev) => [...prev, key])
    setPending(false)
  }

  async function handleRemove(key: string) {
    setItems((prev) => prev.filter((k) => k !== key))
    await removeIndexWidget(key)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-700">Charts</h2>
        <AddWidgetMenu allDefs={allDefs} activeKeys={items} onAdd={handleAdd} />
      </div>

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-sm mb-1">No charts added</p>
          <p className="text-xs">Use Add Chart to pick a series</p>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className={`space-y-4 ${pending ? "opacity-70 pointer-events-none" : ""}`}>
            {items.map((key) => {
              const def = defByKey[key]
              if (!def) return null
              return (
                <SortableIndexCard
                  key={key}
                  id={key}
                  def={def}
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
