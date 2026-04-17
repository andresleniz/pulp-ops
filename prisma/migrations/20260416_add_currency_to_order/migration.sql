-- Add currency (source currency code) and priceOriginal (pre-conversion price) to OrderRecord.
-- currency is populated only when a EUR→USD conversion was applied at import time.
-- priceOriginal stores the original EUR value; price always stores USD after normalization.

ALTER TABLE "OrderRecord" ADD COLUMN "currency" TEXT;
ALTER TABLE "OrderRecord" ADD COLUMN "priceOriginal" DECIMAL(65, 30);
