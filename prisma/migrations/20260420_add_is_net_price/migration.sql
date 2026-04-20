-- Add isNetPrice flag to OrderRecord.
-- Tracks whether a row's price was sourced from a dedicated "net price" CRM column
-- (as opposed to the generic "price" column which may contain a list price).
--
-- All existing rows receive false — they must be re-imported with a CRM file that
-- includes an explicit "net price" column to receive true.
-- Europe queries filter WHERE isNetPrice = true so no existing row is shown in
-- net-price reports until a clean re-import is performed.

ALTER TABLE "OrderRecord" ADD COLUMN "isNetPrice" BOOLEAN NOT NULL DEFAULT false;
