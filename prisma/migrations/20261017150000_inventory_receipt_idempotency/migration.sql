ALTER TABLE "stock_movements" ADD COLUMN "operationKey" TEXT;
CREATE UNIQUE INDEX "stock_movements_operationKey_key" ON "stock_movements"("operationKey");
