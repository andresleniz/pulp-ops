-- Add incoterm to OrderRecord.
-- Stores the Incoterm (e.g. CIF, CFR, FOB) parsed from the CRM Incoterm column.
-- Additive-only — existing rows receive NULL and remain valid.
-- No backfill: rows updated after the next CRM re-import will carry a value.
-- Europe country detail charts group by Incoterm; rows with incoterm IS NULL are
-- excluded from those charts (but still stored in the DB for the detail table).

ALTER TABLE "OrderRecord" ADD COLUMN "incoterm" TEXT;
