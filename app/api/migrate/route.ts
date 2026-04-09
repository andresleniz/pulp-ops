/**
 * POST /api/migrate
 *
 * Triggers all pending data migrations.  Safe to call multiple times —
 * all migrations are idempotent.
 *
 * This endpoint is intentionally unauthenticated in development.
 * In production, protect it with a secret header or restrict to internal
 * calls only.
 */
import { NextResponse } from "next/server"
import { runPendingMigrations } from "@/lib/data-migrations"

export async function POST() {
  try {
    const results = await runPendingMigrations()
    const applied = results.filter((r) => r.status === "applied")
    const failed = results.filter((r) => r.status === "failed")

    return NextResponse.json({
      ok: failed.length === 0,
      applied: applied.length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: failed.length,
      results,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 })
  }
}
