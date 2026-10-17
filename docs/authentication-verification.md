# Authentication verification — 2026-10-17

The initial implementation results below are historical. Current demo/setup results
are recorded in the follow-up section.

- Inspected the existing Prisma schema and all migrations, every application/API
  route, app layout, preview sign-in, audit contracts and installed Next.js 16.4.1
  authentication, Cache Components, cookies, Proxy and Route Handler guides.
- `npx prisma validate`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- `npx vitest run --project server`: 27 files, 267 tests passed. After adding two
  additional security cases and verifying the actual provisioning CLI,
  `npx vitest run --project server tests/integration/auth.test.ts`: 14 tests passed.
  PostgreSQL tests used only the separately configured disposable test database.
- `npm run build -- --webpack`: passed with Next.js 16.4.1, including all protected
  page builds and both authentication endpoints. The default `npm run build`
  (Turbopack) failed due to the environment denying the CSS worker's temporary
  port binding, including on retry with elevated tool access. This is a webpack
  fallback verification, not a successful default build.
- Applied `20261017170000_authentication` to the local application database using
  `prisma migrate deploy`; it was the only pending migration. Before/after row
  counts and sorted row-content digests matched for all 21 existing application
  tables. No reset occurred.
- No users were provisioned into the application database: emails/passwords have
  not been supplied. The tested setup command creates exactly one Admin and one
  Operations user. See [setup instructions](authentication.md).
- No browser inspection, browser automation or UI tests were run or added.
- CodeRabbit review could not run because its installed CLI is signed out. Local
  review and backend verification were completed. The backend suite also emits an
  existing pg query-concurrency deprecation warning; checks pass.
- No dependency was added. This initial implementation was subsequently committed
  as `7acc668`; it was not pushed in that step.

## Changed files

```text
.env.example
README.md
app/(app)/dispatch/page.tsx
app/(app)/fleet/page.tsx
app/(app)/inventory/page.tsx
app/(app)/layout.tsx
app/(app)/products/page.tsx
app/(app)/restocking/page.tsx
app/api/auth/logout/route.ts
app/api/auth/sign-in/route.ts
app/api/customers/route.ts
app/api/dispatch/board/route.ts
app/api/imports/[batchId]/issues/route.ts
app/api/imports/[batchId]/route.ts
app/api/imports/route.ts
app/api/inventory/[locationId]/[productId]/route.ts
app/api/inventory/locations/[locationId]/route.ts
app/api/inventory/route.ts
app/api/inventory/warehouses/route.ts
app/api/jobs/[jobId]/assign/route.ts
app/api/jobs/[jobId]/cancel/route.ts
app/api/jobs/[jobId]/complete/route.ts
app/api/jobs/[jobId]/eligible-vans/route.ts
app/api/jobs/[jobId]/reassign/route.ts
app/api/jobs/[jobId]/route.ts
app/api/jobs/[jobId]/schedule/route.ts
app/api/jobs/[jobId]/start/route.ts
app/api/jobs/route.ts
app/api/products/[productId]/route.ts
app/api/products/route.ts
app/api/restock-jobs/[restockJobId]/collect/route.ts
app/api/restock-jobs/[restockJobId]/route.ts
app/api/restock-jobs/recalculate/route.ts
app/api/restock-jobs/route.ts
app/api/stock/corrections/route.ts
app/api/stock/movements/route.ts
app/api/stock/transfers/route.ts
app/api/technicians/route.ts
app/api/units/verify/route.ts
app/api/vans/[vanId]/route.ts
app/api/vans/[vanId]/stock/route.ts
app/api/vans/route.ts
components/dispatch/assignment/assign-dialog.tsx
components/dispatch/use-request-actions.tsx
components/fleet/fleet-form.tsx
components/inventory/inventory-details.tsx
components/inventory/inventory-operation-sheet.tsx
components/inventory/warehouse-form.tsx
components/shell/app-header.tsx
components/shell/auth-user-provider.tsx
components/sign-in/sign-in-screen.tsx
docs/authentication-verification.md
docs/authentication.md
lib/auth/session-cookie.ts
lib/auth/sign-in.ts
lib/auth/user.ts
lib/contracts/common.ts
next.config.ts
package.json
prisma/migrations/20261017170000_authentication/migration.sql
prisma/schema.prisma
proxy.ts
scripts/provision-users.ts
server/http/errors.ts
server/http/route.ts
server/modules/auth/auth.http.ts
server/modules/auth/password.ts
server/modules/auth/protected-page.tsx
server/modules/auth/provision.service.ts
server/modules/auth/request.ts
server/modules/auth/session.service.ts
server/modules/import/import.service.ts
server/modules/import/persist-plan.ts
tests/integration/auth.test.ts
tests/unit/sign-in.test.ts
```


## Demo sign-in and secure setup follow-up — 2026-10-17

- Started from a clean working tree at `7acc668`; no unrelated edits were present.
- Read both authentication documents and the existing provisioning script/service
  before implementation. Read the installed Next.js Cache Components and Proxy
  guides before changing the request-time sign-in page.
- `npx prisma migrate status`: all seven migrations are already applied. No schema
  changes, migration application, or database reset was needed for this follow-up.
- Initial configuration audit printed presence only: `AUTH_ORIGIN` and both
  account emails/passwords were missing; demo sign-in was disabled. The initial
  local database account count was zero. Passwords and hashes were not printed.
- Added `npm run auth:provision -- --interactive`: real terminal required;
  password entry and confirmation are hidden; only a missing public origin is
  appended to ignored `.env`. Account secrets remain in process memory and pass
  through the existing atomic/idempotent provisioning service. No passwords are
  written to files. Environment-based provisioning remains supported.
- Added request-time demo account listing and `/api/auth/demo-sign-in`. Both the
  UI and endpoint require exact server-side `AUTH_DEMO_SIGN_IN=true`; default is
  off. It selects only matching active initial bootstrap users by role, rejects
  client-selected identities, and uses the normal session creation/rotation path.
  No role-based permission restrictions were added. Session creation rechecks
  active status, password hash, role and provisioning slot under a database lock.
- `npx vitest run --project server`: **28 files, 276 tests passed**, including
  **18 authentication integration tests and 3 hidden-input unit tests**. Tests
  cover default/explicit disablement, active/missing/disabled/mismatched demo
  accounts, normal session cookies/rotation/logout, both roles reading/writing,
  origin checks and throttling, existing authentication/audit/provisioning rules,
  hidden password entry, confirmation failures, and terminal requirements.
- `npm run typecheck`, `npm run lint`, `git diff --check`: passed.
- `npm run build -- --webpack`: passed; sign-in is request-time streamed behind
  Suspense and the demo login endpoint is dynamic. This is the same webpack
  fallback used previously; the default Turbopack build was not rerun in this phase.
- No browser inspection, browser automation, or UI tests were run or added.
- At the end of the private-credential setup step, provisioning was pending local
  terminal entry. The later public-demo seeding results below supersede that
  pending status.
- Before/after counts and sorted content digests matched for all 21 operational
  tables. Existing application data is unchanged. No raw records or secrets were
  included in the verification output.
- Changed: `.env.example`, sign-in page/screen, Proxy allowlist, auth session/HTTP
  modules, provisioning CLI, setup/verification docs and authentication tests.
  Added: `lib/auth/demo.ts`, `server/modules/auth/demo.service.ts`, demo API route,
  `scripts/provision-input.ts`, and `tests/unit/provision-input.test.ts`.
- This follow-up has not been committed or pushed. No dependency was added.


## Public demo accounts seeded — 2026-10-17

The user subsequently authorized public demo credentials in source and on the
sign-in screen for this demonstration application. Private credentials are still
never exposed, and the users table still stores only password hashes.

- `npx prisma migrate status`: all seven migrations were already applied; no
  migration was reapplied and no database was reset.
- `npm run auth:provision -- --demo`: successfully seeded exactly two local users,
  one active Admin and one active Operations user, using stable initial-account
  slots and the existing atomic provisioning flow.
- Local ignored `.env`: demo mode enabled; public origin configured. No passwords
  were added to environment files. The committed example remains disabled by default.
- Verified both real local users' public passwords through normal server password
  authentication, resolved their ordinary database sessions to the correct users,
  and revoked those verification sessions through logout. Only role/status
  summaries were printed. Stored passwords are salted scrypt hashes.
- Verified that the server supplies matching public credentials for both cards.
  The sign-in screen displays email and demo password and its button uses normal
  password login. Private accounts never expose passwords; changed fixture
  passwords are omitted from the cards instead of displaying stale credentials.
- Test-database coverage verifies public seeding, no duplicate users or changed
  hashes on retry, working normal password login for both roles, matching-credential
  display, and omission of stale fixture passwords. Both roles retain full access;
  no role permission gates were introduced.
- Focused backend checks: **22 tests passed** across the authentication integration
  and terminal-input unit suites. Typecheck, lint, `git diff --check`, and
  `npm run build -- --webpack` passed. The default Turbopack build was not rerun.
- All 21 operational tables retained identical row counts and content digests
  after seeding. Stock, movements, jobs and other application data were preserved.
- No browser inspection or UI tests were run. Changes remain uncommitted.
