/**
 * page-layout.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Server-side helpers for the customizable page layout system.
 * Each (page, widgetKey) pair has a unique position stored in PageLayout.
 */

import { prisma } from "@/lib/prisma"

export type PageName = "charts" | "indexes"

/** Returns widget keys in display order for the given page. */
export async function getLayout(page: PageName): Promise<string[]> {
  const rows = await prisma.pageLayout.findMany({
    where: { page },
    orderBy: { position: "asc" },
  })
  return rows.map((r) => r.widgetKey)
}

/** Appends a widget to the end of the layout. No-op if already present. */
export async function addWidget(page: PageName, widgetKey: string): Promise<void> {
  const agg = await prisma.pageLayout.aggregate({
    where: { page },
    _max: { position: true },
  })
  const nextPos = (agg._max.position ?? -1) + 1
  await prisma.pageLayout.upsert({
    where: { page_widgetKey: { page, widgetKey } },
    create: { page, widgetKey, position: nextPos },
    update: {}, // already present — don't change position
  })
}

/** Removes a widget from the layout and reindexes remaining items. */
export async function removeWidget(page: PageName, widgetKey: string): Promise<void> {
  await prisma.pageLayout.deleteMany({ where: { page, widgetKey } })
  // Compact positions so there are no gaps
  const remaining = await prisma.pageLayout.findMany({
    where: { page },
    orderBy: { position: "asc" },
  })
  await Promise.all(
    remaining.map((r, i) =>
      prisma.pageLayout.update({ where: { id: r.id }, data: { position: i } })
    )
  )
}

/**
 * Replaces the full ordered widget list for a page.
 * Called after a drag-and-drop reorder.
 */
export async function reorderWidgets(page: PageName, orderedKeys: string[]): Promise<void> {
  await Promise.all(
    orderedKeys.map((key, i) =>
      prisma.pageLayout.updateMany({
        where: { page, widgetKey: key },
        data: { position: i },
      })
    )
  )
}
