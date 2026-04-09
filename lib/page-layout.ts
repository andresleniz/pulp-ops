/**
 * page-layout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side helpers for the customizable page layout system.
 * Each (page, widgetKey) pair has a unique position stored in PageLayout.
 *
 * ISOLATION INVARIANT (do not violate)
 * ------------------------------------
 * PageLayout is ONLY used for the Charts and Indexes pages (user-configurable
 * widget canvases).  It MUST NOT gate, filter, or influence ANY other page —
 * especially not the dashboard market grid.
 *
 * If PageLayout were accidentally applied to the dashboard, months with no
 * saved widgets would render 0 market cards, hiding all data.
 *
 * DATA PRESERVATION POLICY
 * ------------------------
 * `getLayout()` returns raw keys from storage — some may be stale if an index
 * series was renamed or removed.  The IndexesCanvas silently skips stale keys
 * (safe rendering), but callers should use `getLayoutWithValidation()` in
 * production paths to surface or clean up stale entries.
 *
 * Stale keys are cleaned automatically by the `stale-layout-keys-v1`
 * migration in lib/data-migrations.ts.
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

/**
 * Returns widget keys in display order, filtered to only include keys that
 * are present in `validKeys`.
 *
 * Use this in production page reads to ensure stale keys (e.g. from a
 * renamed index series) do not produce empty widget slots.  The stale entries
 * remain in the DB and are cleaned up by the `stale-layout-keys-v1` migration.
 *
 * @param page    The page to read layout for.
 * @param validKeys  Set of currently valid widget keys for this page.
 */
export async function getLayoutWithValidation(
  page: PageName,
  validKeys: Set<string>,
): Promise<string[]> {
  const all = await getLayout(page)
  const filtered = all.filter((k) => validKeys.has(k))

  if (filtered.length < all.length) {
    const stale = all.filter((k) => !validKeys.has(k))
    console.warn(
      `[page-layout] ${stale.length} stale key(s) filtered from "${page}" layout: ${stale.join(", ")}. ` +
        `Run data migrations to clean them up.`
    )
  }

  return filtered
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
