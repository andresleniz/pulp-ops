/**
 * market-notes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Service layer for MarketNote records.
 *
 * SCOPE DESIGN (intentional)
 * --------------------------
 * MarketNote is MONTH-SCOPED by design.  One note per (market, cycle month).
 * This is appropriate because notes describe cycle-specific context (what
 * happened in March, what was agreed in April, etc.).
 *
 * The primary read is `getMarketNote(marketId, month)` which returns the note
 * for the currently selected cycle month.
 *
 * FALLBACK READ (data safety)
 * ---------------------------
 * `getMarketNoteWithFallback(marketId, month)` adds a safety layer:
 * - First tries the exact month match (primary path).
 * - If no match, returns the most-recently-created note for the market.
 *
 * This ensures that if the month format ever changes, or if a note was
 * created without a month (e.g. via a direct DB insert), it is still
 * surfaced rather than silently lost.
 *
 * Use `getMarketNoteWithFallback` in the market detail page so that any
 * note data that exists is always visible.
 *
 * DATA PRESERVATION POLICY
 * ------------------------
 * Any change to how notes are read, scoped, or stored must either:
 *   a) Remain backward-compatible (old records still returned), OR
 *   b) Include a registered migration in lib/data-migrations.ts.
 *
 * See lib/data-migrations.ts for the `notes-month-scope-v1` migration that
 * documents and verifies this invariant.
 */

import { prisma } from "@/lib/prisma"

export type MarketNoteRow = {
  id: string
  content: string
  /** The month this note was written for, or null if created outside a cycle. */
  month: string | null
}

/**
 * Returns the note for (marketId, month), or null if none exists.
 * Primary read path — use when you want exactly the note for the selected month.
 */
export async function getMarketNote(
  marketId: string,
  month: string,
): Promise<{ id: string; content: string } | null> {
  return prisma.marketNote.findUnique({
    where: { marketId_month: { marketId, month } },
    select: { id: true, content: true },
  })
}

/**
 * Returns the note for (marketId, month) if it exists; otherwise falls back
 * to the most recently created note for the market.
 *
 * Use this in UI read paths instead of `getMarketNote` so that notes are
 * never silently hidden due to a month-format change or scope drift.
 *
 * When a fallback note is returned, `isFallback: true` signals to the caller
 * that it does not belong to the currently selected month — the UI can
 * optionally indicate this to the user.
 */
export async function getMarketNoteWithFallback(
  marketId: string,
  month: string,
): Promise<{ id: string; content: string; month: string | null; isFallback: boolean } | null> {
  // 1. Try exact month match
  const exact = await prisma.marketNote.findUnique({
    where: { marketId_month: { marketId, month } },
    select: { id: true, content: true, month: true },
  })
  if (exact) return { ...exact, isFallback: false }

  // 2. Fall back to most recent note for this market
  const latest = await prisma.marketNote.findFirst({
    where: { marketId },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, month: true },
  })
  if (!latest) return null

  return { ...latest, isFallback: true }
}

/**
 * Upserts the note for (marketId, month).
 * Creates if absent, updates content if present.
 */
export async function upsertMarketNote(
  marketId: string,
  month: string,
  cycleId: string | null,
  content: string,
): Promise<void> {
  await prisma.marketNote.upsert({
    where: { marketId_month: { marketId, month } },
    create: { marketId, month, cycleId, content },
    update: { content },
  })
}
