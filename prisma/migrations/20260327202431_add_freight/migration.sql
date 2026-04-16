-- AlterTable
ALTER TABLE "OrderRecord" ADD COLUMN     "freightPerAdmt" DECIMAL(10,2);

-- RenameIndex
ALTER INDEX "MonthlyPrice_cycleId_fiberId_millId_customerId_key" RENAME TO "monthly_price_unique";
