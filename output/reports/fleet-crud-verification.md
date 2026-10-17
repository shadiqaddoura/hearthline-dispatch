# Fleet CRUD verification — 17 October 2026

Branch: `feat/fleet-crud`, created from the clean `main` working tree. No merge, push or commit was performed.

## Delivered

- Active Fleet destination in the existing Fluent 2 application shell.
- Search by identifier, registration plate, technician and zone; status/undriven filters; identifier, zone and workload sorting; loading, empty and retry states.
- Right-side view, create and edit sheets using the Products viewing-sheet width, Fluent header/close/overlay/transitions, and existing full-width phone pattern.
- Van information, current technician, physical stock versus reservations/availability/broken/unverified quantities, and active assigned jobs.
- Create and update with shared client/server Zod validation, database-enforced code/plate uniqueness, submission guards and retained values after failure. New vans create an empty inventory location without stock or equipment. Technician selection is available when editing the created van.
- Explicit permanent-delete confirmation identifies the van and plate. Success is shown only after the server confirms. Fleet reloads after mutations; Dispatch reloads on Fleet changes and navigation.
- Unsaved-change confirmation, before-unload protection, modal keyboard behavior, visible focus and restoration to the initiating row/Add van action.

## Safety

- Driver changes extend the existing operation: sorted job locks, sorted location locks for both vans, technician lock, transactional rereads, lock-set retries and database-conflict retries remain intact.
- Assigned jobs hand over to the incoming driver. In-progress jobs retain the technician who started them, following existing policy. Moving a driver off a van with active work is blocked; removing a required driver is blocked.
- Garage/Sold vans cannot receive new customer jobs. Taking an active van with assigned/in-progress work out of service is rejected and lists job references.
- Driver/zone changes do not move physical inventory or automatically move jobs between vans. Identifier edits rename only the location label, retaining its ID and stock records.
- Deletion locks the van location and van row, rechecks dependencies, and removes only an unused van and its empty location. Any stock-balance row (including zero), equipment unit, reservation (including historical), job, movement, restock record or correction blocks it. No operational/inventory history is cascaded away.
- Raw import records lack a direct van FK. A conservative case-insensitive, trimmed source-value check protects imported vans; their identifiers cannot be renamed in a way that loses provenance. A blocked delete offers Edit → Sold as a separate operation, subject to active-work restrictions.
- Existing demo-session labeling is preserved. Real authentication remains unimplemented in the existing application.

## Automated backend/static checks

Passed:

- `npm run typecheck`
- `npm run lint`
- `npm run build -- --webpack`
- `git diff --check`
- 40 distinct focused backend cases across `fleet-crud`, `driver-moves`, `dispatch` and `lock-order` suites. The shared run passed 38 cases; the Fleet suite was then extended with explicit Garage/Sold checks and its final 11 cases passed. No UI/component/browser test suite was created, changed or run.

The default `npm run build` (Turbopack) was attempted and failed on an environment port-binding permission error in the CSS compiler worker. The production Webpack build passed. PostgreSQL's existing driver emitted a query-concurrency deprecation warning; the focused tests passed.

## Direct browser checks

Used a production preview at port 3101 against the new `hearthline_fleet_browser_20261017` database, separately from backend tests in `hearthline_fleet_crud_test_20261017`. No existing development/application data was reset or cleared. The disposable databases remain available; the isolated preview server was stopped after checks.

Verified directly:

- Empty Fleet and loading states.
- Blank identifier validation and focus on the invalid field.
- Create `QA-EMPTY` / `QA-100`, view empty inventory and job details, edit its zone, and permanently delete this eligible unused van.
- Duplicate identifier and plate rejections, with entered values retained.
- Escape opens the unsaved-change confirmation; discard returns focus to Add van.
- Close details returns focus to its row button, including after editing.
- Isolated `QA-WORK` driver handover from `QA Driver` to `QA Spare`; assigned job `QA-ASSIGNED` follows the new driver. Stock remained cable 10 working / 2 reserved / 8 available; printer 3 working / 1 available / 1 broken / 2 unverified. Database readback still showed only the three original opening movements.
- Garage status change for the working van rejected with `QA-ASSIGNED` in the explanation.
- Unsafe deletion rejected with counts for stock balances, equipment, reservations, jobs and movements.
- Registration search, Garage filter and descending identifier order.
- Dispatch reflects the new technician and marks the Garage van unavailable for the pending customer request.
- Desktop and 390×700 phone sheets; scrollable content and stock tables, keyboard table scrolling, Tab navigation, persistent footer controls and visible keyboard focus. Temporary viewport override was reset.
- Stopped only the isolated preview to simulate a network failure: Refresh retained the list and displayed a stale-data warning with Retry. Restarting the preview and selecting Retry cleared the warning and recovered the list.

Browser checks found and prompted fixes for an overlapping/stale sheet after save, cramped table headings, and disappearing-action focus handling. Metadata-only edits were also corrected to avoid creating unnecessary restock history.

## Limits

- Garage unavailability was inspected in the browser; both Garage and Sold assignment restrictions were verified by backend tests. Simultaneous driver/assignment/deletion races were verified by backend tests rather than browser automation.
- Import-source protection is conservative because the schema stores source records as raw JSON rather than a vehicle FK.
- Real authentication and the environment's Turbopack worker restriction remain outside this Fleet change.
