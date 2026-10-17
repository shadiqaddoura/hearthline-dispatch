# Authentication setup and operations

Authentication uses PostgreSQL through Prisma. Both Admin and Operations have full
access to all pages and API operations. Roles are identification labels only.
There is no public registration or demo bypass.

## Deploy without resetting data

1. Back up the target database using your normal backup process. Set `DATABASE_URL`
   to that database. Keep `TEST_DATABASE_URL` pointed at a **different, disposable**
   database: the backend suite clears its tables.
2. Run `npm ci` (generates the Prisma client), then `npm run db:deploy`.
   Migration `20261017170000_authentication` only adds `users`, `sessions`,
   `login_throttles`, their indexes, one enum, and constraints inside a transaction.
   It does not change or delete operational tables, historical audit text, or users.
   Review any other pending migrations before deploying. Never use `db:reset` for
   this setup.
3. Configure `AUTH_ORIGIN` to the exact browser origin, e.g.
   `https://dispatch.example.com`, without a path. Production requires HTTPS and
   uses a Secure `__Host-` cookie. Local `next dev` supports HTTP localhost with a
   different cookie name. Serve production over HTTPS even behind a reverse proxy.
4. Supply these **server-side** environment variables from a secret manager,
   interactive secret input, or a local ignored `.env` file. Do not place passwords
   in command arguments, shell history, shared terminals, committed files, or logs.

   | Variable | Purpose |
   | --- | --- |
   | `AUTH_ADMIN_EMAIL` | First user's email |
   | `AUTH_ADMIN_NAME` | Display name (defaults to Admin) |
   | `AUTH_ADMIN_PASSWORD` | Unique password: at least 15 characters, at most 1024 bytes |
   | `AUTH_OPERATIONS_EMAIL` | Second user's distinct email |
   | `AUTH_OPERATIONS_NAME` | Display name (defaults to Operations) |
   | `AUTH_OPERATIONS_PASSWORD` | A different password with the same requirements |

5. Run `npm run auth:provision`. The first run adds exactly one Admin and one
   Operations account atomically. Emails are normalized to lowercase. Passwords
   are salted and hashed with Node scrypt (N=131072, r=8, p=1, 64-byte output,
   random 16-byte salt), matching the
   [OWASP scrypt recommendation](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
   The command prints no credentials. Both users can sign in at `/sign-in`.
6. Remove the provisioning passwords from the running application's environment
   after setup; the web process only needs `DATABASE_URL` and `AUTH_ORIGIN`.
   Rebuild/restart the application with production configuration.

Provisioning uses two stable bootstrap keys. Repeating it with the same emails
and roles leaves existing users and password hashes unchanged. It does not erase
additional users, rename accounts, reactivate disabled accounts, or silently take
over an existing email. Invalid or conflicting setup rolls back the whole command.
For intentional password rotation, supply the same account emails and new secrets,
then run `npm run auth:provision -- --rotate-passwords`. This updates both initial
passwords and invalidates their sessions atomically. Names/roles are not changed.
Keep a secure record of the account emails for future rotations.

## Session and request protection

- Random 256-bit opaque session tokens are held in an HttpOnly, SameSite=Lax,
  Path=/ cookie with no Domain attribute. Production adds Secure and a `__Host-`
  prefix. No tokens or password hashes are exposed in client JSON.
- PostgreSQL stores only SHA-256 token hashes. Sessions expire after eight hours
  with no sliding renewal. Login always issues a new token and revokes the previous
  cookie's session; logout deletes its session server-side and expires the cookie.
- Session reads check expiration and the user's active status. Deactivating a user
  immediately denies subsequent requests. Initial-account password rotation also
  deletes all their sessions, serialized against simultaneous sign-ins.
- Proxy performs only an early cookie-presence check. The app layout **and every
  application page** revalidate against PostgreSQL at request time behind Suspense
  boundaries, as required by the installed Next.js 16.4.1 Cache Components guide.
  The shared API wrapper independently validates the session before business work.
  Anonymous pages redirect to sign-in; APIs return JSON 401. No role gates exist.
- All mutating API requests, including sign-in and logout, require an Origin equal
  to `AUTH_ORIGIN` and reject cross-site Fetch Metadata. Command-line API clients
  must supply that Origin plus their session cookie. No GET endpoint mutates data.
- Invalid sign-ins return the same error for unknown, disabled, and incorrect
  accounts. Unknown accounts still perform password hashing. PostgreSQL throttles
  login attempts across instances: 10 per normalized email per 15-minute window,
  plus 60 total attempts per minute. Attempts include successes. No untrusted
  forwarded IP headers are used. A throttled account/window must wait for expiry.
- HTTP handlers overwrite all audit actor fields using `name <email> [userId]`
  from the validated session, before schema validation. Client-supplied actor
  values are ignored. Existing historical strings remain intact. CLI stock-book
  imports retain the explicit `stock-book import` service identity; HTTP imports
  use the authenticated user.

## Verification and maintenance

Run `npm run typecheck`, `npm run lint`, `npm run build`, and
`npx vitest run --project server`. No browser or UI tests are needed for this change.
`tests/integration/auth.test.ts` uses the existing isolated test-database harness
and a mocked Next request-cookie adapter, with real Prisma/PostgreSQL and hashing.
It covers login failures/success, rotation, expired/disabled/deleted sessions,
both roles, every business route's anonymous enforcement, logout, origin checks,
production cookies, throttling, trusted audit identity, and safe provisioning.

For periodic cleanup, run the following through your normal database maintenance
channel (only expired authentication records are removed):

```sql
DELETE FROM sessions WHERE "expiresAt" <= now();
DELETE FROM login_throttles WHERE "expiresAt" <= now();
```

Expired rows cannot authorize a request even before cleanup. There is no automatic
maintenance scheduler, self-service password recovery, MFA, user-management UI,
or public signup in this initial scope. Future users can share this User model
without changing operational records. The global login budget is deliberately
conservative; tune it along with upstream request/body/concurrency limits for a
larger deployment. PostgreSQL is required for every authentication check; database
failures fail closed. Logout affects the current session; rotation affects all
sessions for the two provisioned accounts. Existing UI tests were not run.
