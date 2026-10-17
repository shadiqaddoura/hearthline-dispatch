CREATE TYPE "DemoSection" AS ENUM ('PRODUCTS', 'CUSTOMERS', 'FLEET', 'INVENTORY', 'DISPATCH', 'RESTOCKING', 'IMPORTS');
CREATE TYPE "DemoEntityType" AS ENUM ('PRODUCT', 'CUSTOMER', 'BRANCH', 'TECHNICIAN', 'LOCATION', 'VAN', 'STOCK_BALANCE', 'STOCK_MOVEMENT', 'JOB', 'JOB_ITEM', 'RESTOCK_JOB', 'RESTOCK_ITEM', 'IMPORT_BATCH', 'IMPORT_SOURCE_ROW', 'IMPORT_ISSUE');
CREATE TYPE "DemoClaimKind" AS ENUM ('PRIMARY', 'DEPENDENCY');

CREATE TABLE "demo_records" (
  "id" TEXT NOT NULL,
  "fixtureKey" TEXT NOT NULL,
  "entityType" "DemoEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demo_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demo_record_claims" (
  "recordId" TEXT NOT NULL,
  "section" "DemoSection" NOT NULL,
  "kind" "DemoClaimKind" NOT NULL,
  CONSTRAINT "demo_record_claims_pkey" PRIMARY KEY ("recordId", "section")
);

CREATE UNIQUE INDEX "demo_records_fixtureKey_key" ON "demo_records"("fixtureKey");
CREATE UNIQUE INDEX "demo_records_entityType_entityId_key" ON "demo_records"("entityType", "entityId");
CREATE INDEX "demo_records_entityType_idx" ON "demo_records"("entityType");
CREATE INDEX "demo_record_claims_section_idx" ON "demo_record_claims"("section");
ALTER TABLE "demo_record_claims" ADD CONSTRAINT "demo_record_claims_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "demo_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
