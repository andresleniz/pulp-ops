# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm run start        # Start production server

# Database
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:migrate   # Run migrations (creates new migration)
npm run db:seed      # Seed database with sample data
npm run db:reset     # Full reset + reseed (destructive)
npm run db:studio    # Open Prisma Studio GUI
```

```bash
# Safety tests & migrations
npm run test:dashboard  # Verify all months show 11 markets; layout isolation
npm run test:safety     # Regression tests: task/note persistence, layout safety, migration idempotence
npm run migrate         # Run all pending data migrations (idempotent)
```

## Data Preservation Policy

**Non-negotiable rule: future changes must never make existing user records invisible.**

### What this means in practice

Any change to a persistence model, query scope, or page layout that could affect data visibility **must** include one of:

1. **Backward-compatible reads** — old records are still returned by the current queries without modification (preferred), OR
2. **A registered data migration** in `lib/data-migrations.ts` that converts old records to the new shape before go-live.

Silence is not acceptable. A refactor that makes existing records disappear from the UI is a data-loss bug even if the rows still exist in the database.

### Scope-change rules

| Model | Scope rule | File that enforces it |
|---|---|---|
| `MarketTask` | Market-scoped. `month` field is metadata only. **Never add a `month` filter to `listMarketTasks`.** | `lib/market-tasks.ts` |
| `MarketNote` | Month-scoped (per-cycle). Use `getMarketNoteWithFallback()` in UI paths to surface notes even if month format changes. | `lib/market-notes.ts` |
| `PageLayout` | Widget config only. **Must never gate dashboard market queries.** Use `getLayoutWithValidation()` to filter stale keys. | `lib/page-layout.ts`, `lib/dashboard-queries.ts` |
| `MonthlyCycle` | Dashboard reads directly. Zero dependency on `PageLayout`. | `lib/dashboard-queries.ts` |

### When adding a data migration

1. Open `lib/data-migrations.ts`
2. Add a new `Migration` object with a **stable, unique `id`** (never change after first deployment)
3. Implement `check()` (cheap DB read) and `run()` (idempotent transformation)
4. Append it to the `MIGRATIONS` array
5. Test idempotence with `npm run test:safety`
6. Trigger via `npm run migrate` or `POST /api/migrate`

### Tests

Run `npm run test:safety` to verify:
- Tasks with any `month` value are returned by `listMarketTasks`
- Notes are found by fallback read even if month doesn't match
- Dashboard cycle counts are independent of `PageLayout`
- Stale layout keys are filtered without hiding valid keys
- All migrations are idempotent

## Architecture

**Pulp Ops** is a full-stack Next.js (App Router) application for managing pulp market pricing operations — monthly pricing cycles, customer pricing rules, email communication drafts, negotiation tracking, and order records.

### Data Model Core Concepts

The central workflow is: **MonthlyCycle → MonthlyPrice → EmailDraft → OrderRecord**

- **MonthlyCycle** — one per market per month, tracks `CycleStatus` (open → closed)
- **MonthlyPrice** — calculated prices scoped to a cycle, fiber, mill, and customer
- **PricingRule** — defines how prices are calculated; evaluated by the pricing engine using priority: mill-specific > subgroup > market-wide
- **IndexDefinition / IndexValue** — market pricing indices (e.g., PIX China, TTO) used in formula-based pricing rules
- **Subgroup** — customer groupings that allow shared pricing rules across a market

### Business Logic Engines (`lib/`)

| File | Purpose |
|---|---|
| `pricing-engine.ts` | Evaluates `PricingRule` formulas, resolves index values, selects the applicable rule for a customer/mill/fiber combination |
| `task-engine.ts` | Auto-generates `Task` records for a cycle based on gaps (missing prices, missing indexes, pending announcements) |
| `email-engine.ts` | Renders `EmailTemplate` content with mustache-style substitution; computes price changes vs. prior month |
| `audit.ts` | Records field-level changes to `AuditLog` |
| `snapshot.ts` | Creates point-in-time captures of cycle state |
| `crm-importer.ts` | Parses Excel/CSV uploads to import CRM data |

### Routing and Data Access

All pages are **Server Components** — they fetch from Prisma directly (no REST layer). Mutations go through **Server Actions** defined in `actions.ts` files co-located with their pages (e.g., `app/markets/[id]/actions.ts`).

API routes exist only for file-upload endpoints:
- `app/api/import/route.ts` — generic CRM import
- `app/api/import-usa/route.ts` — USA-specific import
- `app/api/usa-charts/route.ts` — chart data endpoint

### Database

SQLite via Prisma, stored at `prisma/pulp_ops.db`. The `DATABASE_URL` is set in `.env`. After any schema change, run `db:generate` then `db:migrate`.

### Path Alias

`@/*` resolves to the project root (e.g., `@/lib/prisma`, `@/components/ui/card`).

### Styling

Tailwind CSS utility classes throughout. Component variants use `class-variance-authority`. Combine classes with `cn()` from `@/lib/utils` (wraps `clsx` + `tailwind-merge`). Status colors follow: green = confirmed/active, amber = in-progress, red = alerts/missing, blue = informational.
