-- Refresh display values only for records explicitly tracked as Settings fixtures.
-- IDs, foreign keys, stock, movements, and authentication records are untouched.
UPDATE "products" AS product
SET "sku" = CASE fixture."fixtureKey"
    WHEN 'product.paper' THEN 'THERMAL-PAPER-80'
    WHEN 'product.cable' THEN 'ETHERNET-CAT6'
  END,
  "name" = CASE fixture."fixtureKey"
    WHEN 'product.paper' THEN 'Thermal Paper Rolls'
    WHEN 'product.cable' THEN 'Cat6 Ethernet Cable'
  END
FROM "demo_records" AS fixture
WHERE fixture."entityType" = 'PRODUCT'
  AND fixture."entityId" = product."id"
  AND fixture."fixtureKey" IN ('product.paper', 'product.cable');

UPDATE "customers" AS customer
SET "name" = 'Juniper Table Group'
FROM "demo_records" AS fixture
WHERE fixture."entityType" = 'CUSTOMER'
  AND fixture."entityId" = customer."id"
  AND fixture."fixtureKey" = 'customer.main';

UPDATE "technicians" AS technician
SET "name" = 'Dana Haddad'
FROM "demo_records" AS fixture
WHERE fixture."entityType" = 'TECHNICIAN'
  AND fixture."entityId" = technician."id"
  AND fixture."fixtureKey" = 'fleet.technician';

UPDATE "locations" AS location
SET "name" = 'Van V-12'
FROM "demo_records" AS fixture
WHERE fixture."entityType" = 'LOCATION'
  AND fixture."entityId" = location."id"
  AND fixture."fixtureKey" = 'fleet.location';

UPDATE "vans" AS van
SET "code" = 'V-12', "plate" = '38-24716'
FROM "demo_records" AS fixture
WHERE fixture."entityType" = 'VAN'
  AND fixture."entityId" = van."id"
  AND fixture."fixtureKey" = 'fleet.van';

UPDATE "jobs" AS job
SET "reference" = 'REQ-2026-1042',
    "notes" = 'Deliver thermal paper to the Downtown branch.'
FROM "demo_records" AS fixture
WHERE fixture."entityType" = 'JOB'
  AND fixture."entityId" = job."id"
  AND fixture."fixtureKey" = 'dispatch.request';

UPDATE "stock_movements" AS movement
SET "note" = 'Opening balance recorded from Settings'
FROM "demo_records" AS fixture
WHERE fixture."entityType" = 'STOCK_MOVEMENT'
  AND fixture."entityId" = movement."id"
  AND fixture."fixtureKey" = 'inventory.paper.opening';
