# Authentication verification — 2026-10-17

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
- No dependency was added. Changes remain uncommitted and were not pushed.

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
