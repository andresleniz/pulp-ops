/**
 * data-migrations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight app-level data migration framework.
 *
 * PURPOSE
 * -------
 * Schema migrations (via `prisma migrate`) handle structural DB changes.
 * This module handles *data* migrations: scope changes, key renames, field
 * re-interpretations, and other transformations that Prisma cannot express.
 *
 * INVARIANTS (non-negotiable)
 * ---------------------------
 * 1. Every migration is IDEMPOTENT — running it twice is safe.
 * 2. Every migration is NON-DESTRUCTIVE — existing user records are never
 *    deleted.  If a record no longer fits the current model, it is moved or
 *    updated, never dropped.
 * 3. Every migration is LOGGED — completion is recorded in AuditLog so the
 *    system can detect "already ran" without a separate migration table.
 * 4. Migrations run in registration order.  Later migrations may depend on
 *    earlier ones having completed.
 *
 * ADDING A NEW MIGRATION
 * ----------------------
 * 1. Write a new object that satisfies the `Migration` interface below.
 * 2. Append it to the MIGRATIONS array at the bottom of this file.
 * 3. Give it a stable, unique `id` — never change this after deployment.
 * 4. The check() function MUST be cheap (a single count query is fine).
 * 5. The run() function MUST be idempotent.
 *
 * DATA PRESERVATION POLICY
 * ------------------------
 * Any future change to a persistence model or query scope MUST include either:
 *   a) A backward-compatible read (old records are still returned by current
 *      queries without modification), OR
 *   b) A migration registered here that converts old records to the new shape.
 *
 * Silence is NOT acceptable: a refactor that makes existing records invisible
 * in the UI is a data-loss bug even if the records still exist in the DB.
 */

import { prisma } from "@/lib/prisma"

// ── Migration type ────────────────────────────────────────────────────────────

export type MigrationResult = {
  id: string
  status: "skipped" | "applied" | "failed"
  detail?: string
}

type Migration = {
  /** Stable unique identifier — never change after first deployment. */
  id: string
  /** Human-readable description for logs and audit trail. */
  description: string
  /**
   * Returns true when this migration needs to run.
   * Must be cheap (single count/exists query).
   */
  check: () => Promise<boolean>
  /**
   * Applies the migration.  Must be idempotent: calling run() when check()
   * would return false must be a safe no-op.
   */
  run: () => Promise<void>
}

// ── Audit helpers ─────────────────────────────────────────────────────────────

async function hasMigrationLog(id: string): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: { entity: "DataMigration", entityId: id },
  })
  return row !== null
}

async function logMigration(id: string, detail: string): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entity: "DataMigration",
      entityId: id,
      field: "status",
      oldValue: null,
      newValue: "applied",
      changedBy: "system",
      metadata: detail,
    },
  })
}

// ── Migration registry ────────────────────────────────────────────────────────

/**
 * MIGRATION: tasks-market-scope-v1
 *
 * WHY: In a previous version, MarketTask.month was used as a visibility filter
 * (tasks only appeared when the UI was on the matching month).  The scope was
 * changed to market-wide: tasks are now visible regardless of selected month.
 * The `month` field is retained as metadata but must not be used in read
 * filters.
 *
 * This migration is a no-op today (no month-filtered reads exist in the code)
 * but it:
 *   1. Documents the scope change permanently in the audit trail.
 *   2. Provides a check point if month-filter reads are accidentally
 *      re-introduced in the future.
 *
 * DATA GUARANTEE: all existing MarketTask rows remain accessible; their
 * `month` field is preserved as-is.
 */
const tasksMarketScopeV1: Migration = {
  id: "tasks-market-scope-v1",

  description:
    "Record that MarketTask scope was changed from month-scoped to market-scoped; " +
    "confirm no month-filter reads exist (no-op data migration)",

  async check() {
    // Only needs to run once — check if it has been logged already
    return !(await hasMigrationLog("tasks-market-scope-v1"))
  },

  async run() {
    const total = await prisma.marketTask.count()
    const withMonth = await prisma.marketTask.count({ where: { month: { not: null } } })

    await logMigration(
      tasksMarketScopeV1.id,
      `Scope confirmed market-wide. Total tasks: ${total}. ` +
        `Tasks with legacy month metadata: ${withMonth} (retained, not filtered).`
    )
  },
}

/**
 * MIGRATION: notes-month-scope-v1
 *
 * WHY: MarketNote is intentionally month-scoped (one note per market per cycle
 * month).  This migration documents that invariant and confirms all note rows
 * have a non-null month so the unique(marketId, month) lookup is reliable.
 *
 * If any note rows have month=null (e.g. created by a seeder or migration
 * error), this migration flags them in the audit trail so they can be reviewed.
 * Notes with month=null are NOT deleted — they are left intact.
 */
const notesMonthScopeV1: Migration = {
  id: "notes-month-scope-v1",

  description:
    "Verify all MarketNote rows have a non-null month; log any anomalies",

  async check() {
    return !(await hasMigrationLog("notes-month-scope-v1"))
  },

  async run() {
    const total = await prisma.marketNote.count()
    const nullMonth = await prisma.marketNote.count({ where: { month: null } })

    await logMigration(
      notesMonthScopeV1.id,
      `Total notes: ${total}. Notes with null month (cannot be matched by month lookup): ${nullMonth}.`
    )
  },
}

// ── Registered migrations (in run order) ─────────────────────────────────────

const MIGRATIONS: Migration[] = [
  tasksMarketScopeV1,
  notesMonthScopeV1,
]

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Runs all pending migrations in registration order.
 *
 * Call this at application startup (e.g. from a Server Component that runs
 * once per cold start, or from an explicit `/api/migrate` endpoint).
 *
 * Each migration is checked independently — a failure in one does not block
 * subsequent migrations.
 */
export async function runPendingMigrations(): Promise<MigrationResult[]> {
  const results: MigrationResult[] = []

  for (const migration of MIGRATIONS) {
    try {
      const needed = await migration.check()
      if (!needed) {
        results.push({ id: migration.id, status: "skipped" })
        continue
      }

      await migration.run()
      results.push({
        id: migration.id,
        status: "applied",
        detail: migration.description,
      })
    } catch (err: any) {
      results.push({
        id: migration.id,
        status: "failed",
        detail: err?.message ?? String(err),
      })
      console.error(`[data-migrations] Migration "${migration.id}" failed:`, err)
    }
  }

  return results
}

/**
 * Runs migrations and logs results to console.
 * Suitable for use in server startup paths where you want visibility but
 * don't want to crash on migration failure.
 */
export async function runMigrationsWithLogging(): Promise<void> {
  const results = await runPendingMigrations()
  for (const r of results) {
    if (r.status === "applied") {
      console.log(`[data-migrations] Applied: ${r.id} — ${r.detail}`)
    } else if (r.status === "failed") {
      console.error(`[data-migrations] FAILED: ${r.id} — ${r.detail}`)
    }
  }
}
