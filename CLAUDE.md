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

There is no test suite in this project.

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
