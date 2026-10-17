# Warehouse location management

Implemented 2026-10-17. Inspected Inventory/Fleet services and components, Prisma schema/migrations, import hub conventions, ledger, product references, locking, and the installed Next.js route-handler documentation.

## Behavior

- Inventory lists warehouse and van locations, including empty locations, with explicit type and stock-tracking state.
- Create warehouse configures the single canonical HUB. Existing uncounted hubs retain their location ID and all historical references; a new installation creates one HUB.
- Name, actor and count reference are validated. Only existing Products Catalog IDs are accepted. Selected products have separate working/broken physical quantities in base units.
- One transaction configures the location and writes positive opening quantities through `moveStock` as OPENING_BALANCE movements. Empty/zero quantities create no balances, devices or movements. An invalid line rolls back the entire operation.
- Concurrent or repeated setup cannot double stock: transaction advisory lock, recheck under the location lock, and database partial uniqueness for HUB.
- Serialised counts create unverified units. Previously returned identified and unidentified devices retain their IDs and are included in the physical opening count. Counts below recorded devices are refused.
- Configured warehouse balances participate in receipts, transfers, corrections and restocking. Shared sorted location locks protect both ends. Collections cannot overdraw the warehouse; broken returns increase its broken stock.
- Unconfigured legacy hubs retain their former receipt behavior until explicit setup. Historic movements are not replayed into an invented shelf balance.
- Sidebar, page metadata, section reference and inventory guidance use Products Catalog.

## Files changed

- `components/inventory/inventory-view.tsx`: unified location table, warehouse flow, type labels and filtering.
- `components/inventory/warehouse-form.tsx`: Fluent drawer, catalog selection, working/broken counts and validation.
- `components/inventory/inventory-table.tsx`: warehouse/van labels on stock rows.
- `components/inventory/inventory-details.tsx`: warehouse stock actions; van receipt action remains van-specific.
- `components/inventory/inventory-operation-sheet.tsx`: Products Catalog reference.
- `components/shell/navigation.ts`, `components/products/products-view.tsx`, `app/(app)/products/page.tsx`: catalog navigation/page labels.
- `lib/contracts/inventory.ts`: warehouse request validation and location tracking state.
- `lib/api/inventory.ts`, `app/api/inventory/warehouses/route.ts`: typed API client and thin POST handler.
- `server/modules/inventory/warehouse.service.ts`: atomic canonical warehouse setup.
- `server/modules/inventory/inventory.service.ts`: warehouse listing/details/corrections and receipt locking.
- `server/modules/inventory/stock-ledger.ts`: configured warehouse balances, opening-device adoption.
- `server/modules/fleet/fleet.repository.ts`: retain canonical warehouse identity after renaming.
- `server/modules/restocking/restock.service.ts`: lock warehouse and van together.
- `prisma/schema.prisma`, `prisma/migrations/20261017160000_warehouse_inventory/migration.sql`: additive tracking flag and single-HUB index.
- `tests/integration/warehouse.test.ts`: 10 focused backend cases.
- `output/reports/warehouse-inventory-verification.md`: this report.

## Verification

- `npx prisma generate`: passed.
- `npm run typecheck`: passed on final changes.
- `npm run lint`: passed on final changes.
- `npm run test -- --project server`: 26 files, 249 tests passed before the final device-adoption extension and two added tests.
- Final focused rerun: warehouse, inventory, receiving-serials and restocking suites: 4 files, 46 tests passed, including all 10 warehouse tests.
- `git diff --check`: passed.
- Database integration tests used only the isolated `TEST_DATABASE_URL`; the test harness applied the additive migration there. The sandbox initially blocked database access; the permitted test run succeeded outside that restriction.
- No development database migrations, reset, import, demo-stock insertion, browser inspection or UI tests were performed.
- CodeRabbit CLI 0.7.6 is installed but signed out, so external CodeRabbit review was unavailable. Local review and the above checks completed.

## Rollout note

Apply the additive migration to the application database before using the updated application. It leaves existing hubs uncounted until explicit physical-count setup. If an installation already has multiple HUB rows, the unique index intentionally fails rather than deleting or merging historical locations; review that data before rollout.
