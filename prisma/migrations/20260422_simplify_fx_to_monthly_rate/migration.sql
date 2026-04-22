-- Simplify FX from daily-rate table to monthly manual rate.
--
-- Removes the FxRate table (daily rates, never populated) and replaces the
-- YYYY-MM-DD fxDateUsed column with a YYYY-MM fxMonthUsed column that records
-- which allocation month the user-entered EUR→USD rate applies to.
--
-- fxRateUsed (Decimal?) is kept as-is — stores the rate the user entered at
-- import time for the corresponding allocation month.  null for USD rows and
-- rows imported before this system existed.
--
-- No data is lost: all existing rows have fxDateUsed = null and fxRateUsed = null
-- (the columns were added in 20260422_add_fx_rate but never written to before
-- this migration).

ALTER TABLE "OrderRecord" DROP COLUMN IF EXISTS "fxDateUsed";
ALTER TABLE "OrderRecord" ADD COLUMN "fxMonthUsed" TEXT;

DROP TABLE IF EXISTS "FxRate";
