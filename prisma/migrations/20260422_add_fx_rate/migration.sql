-- FxRate table — stores daily EUR/USD (and other) exchange rates loaded via
-- the /api/import-fx endpoint.  Used at CRM import time to convert EUR prices
-- to USD for Europe orders.  No runtime FX lookup in any reporting path.
--
-- Effective-date convention: one row per trading day.  When daily granularity
-- is unavailable, the first available day of the target month is used.
-- The importer looks for an exact date match first, then falls back to the
-- first available rate within the same calendar month.

CREATE TABLE "FxRate" (
  "id"            TEXT NOT NULL,
  "date"          TEXT NOT NULL,
  "baseCurrency"  TEXT NOT NULL,
  "quoteCurrency" TEXT NOT NULL,
  "rate"          DECIMAL(18,6) NOT NULL,
  "source"        TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FxRate_date_baseCurrency_quoteCurrency_key"
  ON "FxRate"("date", "baseCurrency", "quoteCurrency");

CREATE INDEX "FxRate_baseCurrency_quoteCurrency_date_idx"
  ON "FxRate"("baseCurrency", "quoteCurrency", "date");

-- FX audit fields on OrderRecord.
-- fxRateUsed: the EUR→USD rate applied at import.  null for non-EUR rows and
--             for rows imported before this migration (pre-FxRate era).
-- fxDateUsed: the trading day the rate was sourced from (YYYY-MM-DD).
--             Matches the FxRate.date value selected by the importer.
--
-- Existing Europe rows retain their stored USD price and remain fully visible.
-- fxRateUsed/fxDateUsed will be null until a re-import is performed with the
-- FxRate table populated.  This is intentional — the old rate (1.09 hardcoded)
-- is preserved as-is in the stored price; we do not backfill with a fake audit
-- value.

ALTER TABLE "OrderRecord" ADD COLUMN "fxRateUsed" DECIMAL(18,6);
ALTER TABLE "OrderRecord" ADD COLUMN "fxDateUsed" TEXT;
