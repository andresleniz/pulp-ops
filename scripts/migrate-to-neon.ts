/**
 * migrate-to-neon.ts
 *
 * Reads all data from the local SQLite DB and inserts it into Neon (PostgreSQL).
 * Run this ONCE from your HOME LAPTOP where pulp_ops.db lives.
 *
 * Setup (run once in the project folder):
 *   npm install better-sqlite3 pg
 *   npm install --save-dev @types/better-sqlite3 @types/pg
 *
 * Then run:
 *   set NEON_URL=postgresql://neondb_owner:npg_wudlCkFg3sQ4@ep-shiny-glade-an395r6c-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require^&channel_binding=require
 *   npx tsx scripts/migrate-to-neon.ts
 */

import Database from "better-sqlite3"
import { Client } from "pg"
import * as path from "path"

const SQLITE_PATH = path.join(__dirname, "../prisma/pulp_ops.db")
const NEON_URL = process.env.NEON_URL

if (!NEON_URL) {
  console.error("❌  Set the NEON_URL environment variable before running.")
  process.exit(1)
}

const sqlite = new Database(SQLITE_PATH, { readonly: true })
const pg = new Client({ connectionString: NEON_URL })

// SQLite stores booleans as 0/1
const bool = (v: unknown) => v === 1 || v === true

// SQLite stores Decimal as TEXT; pass as-is to PG
const dec = (v: unknown) => (v == null ? null : String(v))

// SQLite stores JSON fields as TEXT strings
const json = (v: unknown) => (v == null ? null : JSON.parse(v as string))

function all(table: string) {
  return sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]
}

async function run(sql: string, params: unknown[]) {
  await pg.query(sql, params)
}

async function migrate() {
  await pg.connect()
  console.log("✅  Connected to Neon")

  // ── 1. Region ────────────────────────────────────────────────────────────────
  console.log("Migrating Region...")
  for (const r of all("Region")) {
    await run(
      `INSERT INTO "Region" (id, name, "createdAt") VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.createdAt]
    )
  }

  // ── 2. Agent ─────────────────────────────────────────────────────────────────
  console.log("Migrating Agent...")
  for (const r of all("Agent")) {
    await run(
      `INSERT INTO "Agent" (id, name, email, company, "createdAt") VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.email, r.company ?? null, r.createdAt]
    )
  }

  // ── 3. Fiber ─────────────────────────────────────────────────────────────────
  console.log("Migrating Fiber...")
  for (const r of all("Fiber")) {
    await run(
      `INSERT INTO "Fiber" (id, code, name, unit, "createdAt") VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.code, r.name, r.unit, r.createdAt]
    )
  }

  // ── 4. IndexDefinition ───────────────────────────────────────────────────────
  console.log("Migrating IndexDefinition...")
  for (const r of all("IndexDefinition")) {
    await run(
      `INSERT INTO "IndexDefinition" (id, name, description, unit, "createdAt") VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.description ?? null, r.unit, r.createdAt]
    )
  }

  // ── 5. Market ────────────────────────────────────────────────────────────────
  console.log("Migrating Market...")
  for (const r of all("Market")) {
    await run(
      `INSERT INTO "Market" (id, name, "regionId", "requiresAnnouncement", "communicationType", "agentId", "isActive", notes, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.regionId, bool(r.requiresAnnouncement), r.communicationType, r.agentId ?? null, bool(r.isActive), r.notes ?? null, r.createdAt, r.updatedAt]
    )
  }

  // ── 6. Subgroup ──────────────────────────────────────────────────────────────
  console.log("Migrating Subgroup...")
  for (const r of all("Subgroup")) {
    await run(
      `INSERT INTO "Subgroup" (id, name, "marketId", description, "createdAt") VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.marketId, r.description ?? null, r.createdAt]
    )
  }

  // ── 7. Customer ──────────────────────────────────────────────────────────────
  console.log("Migrating Customer...")
  for (const r of all("Customer")) {
    await run(
      `INSERT INTO "Customer" (id, name, "marketId", "subgroupId", "isDirectContact", "contactEmail", notes, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.marketId, r.subgroupId ?? null, bool(r.isDirectContact), r.contactEmail ?? null, r.notes ?? null, r.createdAt, r.updatedAt]
    )
  }

  // ── 8. Mill ──────────────────────────────────────────────────────────────────
  console.log("Migrating Mill...")
  for (const r of all("Mill")) {
    await run(
      `INSERT INTO "Mill" (id, name, "marketId", "customerId", location, "createdAt") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.marketId, r.customerId ?? null, r.location ?? null, r.createdAt]
    )
  }

  // ── 9. IndexValue ────────────────────────────────────────────────────────────
  console.log("Migrating IndexValue...")
  for (const r of all("IndexValue")) {
    await run(
      `INSERT INTO "IndexValue" (id, "indexId", month, value, "publicationDate", source, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.indexId, r.month, dec(r.value), r.publicationDate ?? null, r.source ?? null, r.createdAt, r.updatedAt]
    )
  }

  // ── 10. PricingRule ──────────────────────────────────────────────────────────
  console.log("Migrating PricingRule...")
  for (const r of all("PricingRule")) {
    await run(
      `INSERT INTO "PricingRule" (id, "marketId", "fiberId", "millId", "subgroupId", method, "formulaExpression", "formulaReadable", "manualPrice", adjustment, priority, "activeFrom", "activeTo", notes, "isActive", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.marketId, r.fiberId, r.millId ?? null, r.subgroupId ?? null, r.method, r.formulaExpression ?? null, r.formulaReadable ?? null, dec(r.manualPrice), dec(r.adjustment), r.priority, r.activeFrom, r.activeTo ?? null, r.notes ?? null, bool(r.isActive), r.createdAt, r.updatedAt]
    )
  }

  // ── 11. CustomerException ────────────────────────────────────────────────────
  console.log("Migrating CustomerException...")
  for (const r of all("CustomerException")) {
    await run(
      `INSERT INTO "CustomerException" (id, "customerId", "fiberId", "adjustmentType", "flatAdjustment", "formulaOverride", "noAnnouncement", "verbalOnly", "delayedStart", notes, "activeFrom", "activeTo", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.customerId, r.fiberId, r.adjustmentType, dec(r.flatAdjustment), r.formulaOverride ?? null, bool(r.noAnnouncement), bool(r.verbalOnly), r.delayedStart ?? null, r.notes ?? null, r.activeFrom, r.activeTo ?? null, r.createdAt]
    )
  }

  // ── 12. EmailTemplate ────────────────────────────────────────────────────────
  console.log("Migrating EmailTemplate...")
  for (const r of all("EmailTemplate")) {
    await run(
      `INSERT INTO "EmailTemplate" (id, "templateKey", version, "marketId", "subjectTemplate", "bodyTemplate", "isActive", notes, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.templateKey, r.version, r.marketId ?? null, r.subjectTemplate, r.bodyTemplate, bool(r.isActive), r.notes ?? null, r.createdAt, r.updatedAt]
    )
  }

  // ── 13. MonthlyCycle ─────────────────────────────────────────────────────────
  console.log("Migrating MonthlyCycle...")
  for (const r of all("MonthlyCycle")) {
    await run(
      `INSERT INTO "MonthlyCycle" (id, month, "marketId", "cycleStatus", "priceStatus", "commStatus", "orderStatus", "onHold", "holdReason", "holdReviewDate", "confirmationType", "confirmationReceived", "confirmationDate", "confirmationRef", owner, "internalNotes", "externalNotes", "closedAt", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.month, r.marketId, r.cycleStatus, r.priceStatus, r.commStatus, r.orderStatus, bool(r.onHold), r.holdReason ?? null, r.holdReviewDate ?? null, r.confirmationType ?? null, bool(r.confirmationReceived), r.confirmationDate ?? null, r.confirmationRef ?? null, r.owner, r.internalNotes ?? null, r.externalNotes ?? null, r.closedAt ?? null, r.createdAt, r.updatedAt]
    )
  }

  // ── 14. MonthlyPrice ─────────────────────────────────────────────────────────
  console.log("Migrating MonthlyPrice...")
  for (const r of all("MonthlyPrice")) {
    await run(
      `INSERT INTO "MonthlyPrice" (id, "cycleId", "marketId", "fiberId", "millId", "customerId", price, "pricingMethod", "formulaSnapshot", "isOverride", "overrideReason", "indexSnapshot", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.cycleId, r.marketId, r.fiberId, r.millId ?? null, r.customerId ?? null, dec(r.price), r.pricingMethod ?? null, r.formulaSnapshot ?? null, bool(r.isOverride), r.overrideReason ?? null, json(r.indexSnapshot), r.createdAt, r.updatedAt]
    )
  }

  // ── 15. EmailDraft ───────────────────────────────────────────────────────────
  console.log("Migrating EmailDraft...")
  for (const r of all("EmailDraft")) {
    await run(
      `INSERT INTO "EmailDraft" (id, month, "cycleId", "templateId", "marketId", "customerId", "agentId", subject, body, "recipientsTo", "recipientsCc", status, "sentAt", "confirmedAt", notes, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.month, r.cycleId, r.templateId ?? null, r.marketId ?? null, r.customerId ?? null, r.agentId ?? null, r.subject, r.body, r.recipientsTo, r.recipientsCc, r.status, r.sentAt ?? null, r.confirmedAt ?? null, r.notes ?? null, r.createdAt, r.updatedAt]
    )
  }

  // ── 16. Task ─────────────────────────────────────────────────────────────────
  console.log("Migrating Task...")
  for (const r of all("Task")) {
    await run(
      `INSERT INTO "Task" (id, month, "cycleId", "marketId", "customerId", type, "dueDate", priority, status, notes, "resolvedAt", "resolvedBy", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.month, r.cycleId ?? null, r.marketId ?? null, r.customerId ?? null, r.type, r.dueDate ?? null, r.priority, r.status, r.notes ?? null, r.resolvedAt ?? null, r.resolvedBy ?? null, r.createdAt, r.updatedAt]
    )
  }

  // ── 17. NegotiationEvent ─────────────────────────────────────────────────────
  console.log("Migrating NegotiationEvent...")
  for (const r of all("NegotiationEvent")) {
    await run(
      `INSERT INTO "NegotiationEvent" (id, date, month, "marketId", "cycleId", "customerId", "fiberId", "discussedPrice", status, summary, "nextStep", owner, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.date, r.month, r.marketId, r.cycleId ?? null, r.customerId ?? null, r.fiberId, dec(r.discussedPrice), r.status, r.summary ?? null, r.nextStep ?? null, r.owner, r.createdAt, r.updatedAt]
    )
  }

  // ── 18. OrderRecord ──────────────────────────────────────────────────────────
  console.log("Migrating OrderRecord...")
  for (const r of all("OrderRecord")) {
    await run(
      `INSERT INTO "OrderRecord" (id, month, "cycleId", "customerId", "fiberId", "millId", volume, price, status, reference, notes, "freightPerAdmt", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.month, r.cycleId, r.customerId, r.fiberId, r.millId ?? null, dec(r.volume), dec(r.price), r.status, r.reference ?? null, r.notes ?? null, dec(r.freightPerAdmt), r.createdAt, r.updatedAt]
    )
  }

  // ── 19. AuditLog ─────────────────────────────────────────────────────────────
  console.log("Migrating AuditLog...")
  for (const r of all("AuditLog")) {
    await run(
      `INSERT INTO "AuditLog" (id, entity, "entityId", field, "oldValue", "newValue", "changedBy", "changedAt", "marketId", month, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.entity, r.entityId, r.field, r.oldValue ?? null, r.newValue ?? null, r.changedBy, r.changedAt, r.marketId ?? null, r.month ?? null, json(r.metadata)]
    )
  }

  // ── 20. Snapshot ─────────────────────────────────────────────────────────────
  console.log("Migrating Snapshot...")
  for (const r of all("Snapshot")) {
    await run(
      `INSERT INTO "Snapshot" (id, "cycleId", month, "marketId", payload, "createdAt", "createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.cycleId, r.month, r.marketId, json(r.payload), r.createdAt, r.createdBy]
    )
  }

  await pg.end()
  sqlite.close()
  console.log("🎉  Migration complete!")
}

migrate().catch((err) => {
  console.error("❌  Migration failed:", err.message)
  process.exit(1)
})
