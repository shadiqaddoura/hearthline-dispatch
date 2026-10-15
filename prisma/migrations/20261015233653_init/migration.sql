-- CreateEnum
CREATE TYPE "VanStatus" AS ENUM ('ACTIVE', 'GARAGE', 'SOLD');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('VAN', 'HUB');

-- CreateEnum
CREATE TYPE "StockCondition" AS ENUM ('WORKING', 'BROKEN');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING_BALANCE', 'JOB_DELIVERY', 'BROKEN_COLLECTION', 'TRANSFER', 'CORRECTION', 'RESTOCK_COLLECTION', 'BROKEN_RETURN');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "UnitVerification" AS ENUM ('VERIFIED', 'NEEDS_VERIFICATION');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('IN_STOCK', 'INSTALLED', 'AT_HUB', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('DELIVERY', 'INSTALLATION', 'REPAIR');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('REQUESTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BlockingReason" AS ENUM ('NO_ELIGIBLE_VAN', 'UNITS_NEED_VERIFICATION', 'IMPORT_NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "CompletionLineKind" AS ENUM ('DELIVERED', 'COLLECTED_BROKEN');

-- CreateEnum
CREATE TYPE "RestockStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "technicians" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plate" TEXT,
    "zone" TEXT,
    "status" "VanStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusNote" TEXT,
    "statusSince" DATE,
    "isPool" BOOLEAN NOT NULL DEFAULT false,
    "currentTechnicianId" TEXT,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialised" BOOLEAN NOT NULL,
    "baseUnit" TEXT NOT NULL DEFAULT 'each',
    "packUnit" TEXT,
    "packSize" INTEGER,
    "vanMinimum" INTEGER NOT NULL DEFAULT 0,
    "autoRestock" BOOLEAN NOT NULL DEFAULT true,
    "restockPolicyNeedsReview" BOOLEAN NOT NULL DEFAULT false,
    "restockPolicyNote" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "locationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("locationId","productId","condition")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "productId" TEXT NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "branchId" TEXT,
    "jobId" TEXT,
    "restockJobId" TEXT,
    "correctionId" TEXT,
    "importRowId" TEXT,
    "serials" TEXT[],
    "performedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_corrections" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "correctedQuantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "correctedBy" TEXT NOT NULL,
    "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_units" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "verification" "UnitVerification" NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "status" "UnitStatus" NOT NULL,
    "locationId" TEXT,
    "branchId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'REQUESTED',
    "branchId" TEXT NOT NULL,
    "requestedOn" DATE,
    "scheduledFor" DATE,
    "sequence" INTEGER,
    "vanId" TEXT,
    "technicianId" TEXT,
    "blockingReason" "BlockingReason",
    "blockingDetail" TEXT,
    "notes" TEXT,
    "sourceStatus" TEXT,
    "importRowId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedOn" DATE,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "job_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_completions" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "completedBy" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "job_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_completion_lines" (
    "id" TEXT NOT NULL,
    "completionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "CompletionLineKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "serials" TEXT[],

    CONSTRAINT "job_completion_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restock_jobs" (
    "id" TEXT NOT NULL,
    "vanId" TEXT NOT NULL,
    "status" "RestockStatus" NOT NULL DEFAULT 'OPEN',
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "restock_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restock_items" (
    "id" TEXT NOT NULL,
    "restockJobId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "outstandingQuantity" INTEGER NOT NULL,
    "collectedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "restock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restock_returns" (
    "id" TEXT NOT NULL,
    "restockJobId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "serials" TEXT[],
    "returnedBy" TEXT NOT NULL,
    "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restock_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_source_rows" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "import_source_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_issues" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT,
    "severity" "IssueSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "technicians_name_key" ON "technicians"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vans_code_key" ON "vans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vans_plate_key" ON "vans"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "vans_currentTechnicianId_key" ON "vans"("currentTechnicianId");

-- CreateIndex
CREATE UNIQUE INDEX "vans_locationId_key" ON "vans"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_name_key" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "branches_customerId_name_key" ON "branches"("customerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("name");

-- CreateIndex
CREATE INDEX "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_fromLocationId_idx" ON "stock_movements"("fromLocationId");

-- CreateIndex
CREATE INDEX "stock_movements_toLocationId_idx" ON "stock_movements"("toLocationId");

-- CreateIndex
CREATE INDEX "reservations_locationId_productId_status_idx" ON "reservations"("locationId", "productId", "status");

-- CreateIndex
CREATE INDEX "reservations_jobId_status_idx" ON "reservations"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_units_serialNumber_key" ON "equipment_units"("serialNumber");

-- CreateIndex
CREATE INDEX "equipment_units_locationId_productId_status_condition_verif_idx" ON "equipment_units"("locationId", "productId", "status", "condition", "verification");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_reference_key" ON "jobs"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_importRowId_key" ON "jobs"("importRowId");

-- CreateIndex
CREATE INDEX "jobs_status_scheduledFor_idx" ON "jobs"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "job_items_jobId_productId_key" ON "job_items"("jobId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "job_completions_jobId_key" ON "job_completions"("jobId");

-- CreateIndex
CREATE INDEX "restock_jobs_vanId_status_idx" ON "restock_jobs"("vanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "restock_items_restockJobId_productId_key" ON "restock_items"("restockJobId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "import_source_rows_batchId_sheet_rowNumber_key" ON "import_source_rows"("batchId", "sheet", "rowNumber");

-- CreateIndex
CREATE INDEX "import_issues_batchId_severity_idx" ON "import_issues"("batchId", "severity");

-- AddForeignKey
ALTER TABLE "vans" ADD CONSTRAINT "vans_currentTechnicianId_fkey" FOREIGN KEY ("currentTechnicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vans" ADD CONSTRAINT "vans_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_restockJobId_fkey" FOREIGN KEY ("restockJobId") REFERENCES "restock_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "stock_corrections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "import_source_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_corrections" ADD CONSTRAINT "stock_corrections_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_corrections" ADD CONSTRAINT "stock_corrections_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_units" ADD CONSTRAINT "equipment_units_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_units" ADD CONSTRAINT "equipment_units_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_units" ADD CONSTRAINT "equipment_units_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_vanId_fkey" FOREIGN KEY ("vanId") REFERENCES "vans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "import_source_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_completions" ADD CONSTRAINT "job_completions_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_completion_lines" ADD CONSTRAINT "job_completion_lines_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "job_completions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_completion_lines" ADD CONSTRAINT "job_completion_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restock_jobs" ADD CONSTRAINT "restock_jobs_vanId_fkey" FOREIGN KEY ("vanId") REFERENCES "vans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restock_items" ADD CONSTRAINT "restock_items_restockJobId_fkey" FOREIGN KEY ("restockJobId") REFERENCES "restock_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restock_items" ADD CONSTRAINT "restock_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restock_returns" ADD CONSTRAINT "restock_returns_restockJobId_fkey" FOREIGN KEY ("restockJobId") REFERENCES "restock_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restock_returns" ADD CONSTRAINT "restock_returns_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_source_rows" ADD CONSTRAINT "import_source_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_sourceRowId_fkey" FOREIGN KEY ("sourceRowId") REFERENCES "import_source_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── Hand-written constraints Prisma cannot express ─────────

-- At most one OPEN restock job per van.
CREATE UNIQUE INDEX "restock_jobs_one_open_per_van" ON "restock_jobs"("vanId") WHERE "status" = 'OPEN';

-- Quantities that describe something happening must be positive.
-- (stock_balances.quantity is deliberately unconstrained: imported negatives are preserved for review.)
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "job_completion_lines" ADD CONSTRAINT "job_completion_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "restock_returns" ADD CONSTRAINT "restock_returns_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "restock_items" ADD CONSTRAINT "restock_items_quantities_non_negative" CHECK ("outstandingQuantity" >= 0 AND "collectedQuantity" >= 0);
