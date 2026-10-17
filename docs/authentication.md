# Authentication setup and operations

Authentication uses PostgreSQL through Prisma. Both Admin and Operations have full
access to all pages and API operations. Roles are identification labels only.
There is no public registration. Optional demo sign-in creates normal authenticated sessions.

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
   after setup; the web process needs `DATABASE_URL`, `AUTH_ORIGIN`, and the optional demo flag.
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

## Secure local account entry

Check migration status with `npx prisma migrate status` first. If it reports up to
date, no migration command is necessary. This demo setup does not change the
schema or reset the database.

If the account credentials are not configured, run this in **your own terminal**
at the project root:

```sh
npm run auth:provision -- --interactive
```

The command asks for any missing public origin, Admin/Operations emails and display
names, and both passwords with confirmation. Password characters are not echoed.
The passwords are kept only in the process memory, passed to the existing atomic
provisioning service, and stored only as salted scrypt hashes in PostgreSQL. They
are never written to `.env` or printed. Only a newly entered public `AUTH_ORIGIN`
is appended to the ignored local `.env`; other configuration is preserved. Use an
exact origin such as `http://localhost:3000` in development or the public HTTPS
origin in production. The prompt refuses non-terminal input, invalid origins,
and mismatched confirmations. Cancel with Ctrl+C before provisioning if needed.

The existing `npm run auth:provision` command still accepts environment-supplied
credentials without interactive input. Both modes share the same stable initial
account slots, uniqueness checks, transactional writes, and safe retry behavior.
Re-enter the same account emails when retrying interactive setup; it will not
replace existing hashes unless `--rotate-passwords` is explicitly supplied.

## Optional demo sign-in

`AUTH_DEMO_SIGN_IN` is a **server-only**, explicit opt-in. It is disabled when
unset or set to anything other than the exact string `true`. The committed
`.env.example` defaults to `false`.

After provisioning the accounts, set this in your ignored local `.env` and restart
the app to show the two demo account options:

```dotenv
AUTH_DEMO_SIGN_IN="true"
```

When enabled, the sign-in page lists the actual active provisioned users with
Admin/Operations labels, their display names/emails, and “Sign in as Admin” and
“Sign in as Operations” buttons. Missing or disabled accounts are not listed.
Each button posts a role selection to `/api/auth/demo-sign-in`; the server maps
that role to the corresponding stable provisioning slot and creates an ordinary
hashed, expiring database session through the same function as password login.
The endpoint rejects additional identity fields. Private account passwords are never sent to the client. Public fixture credentials,
when explicitly seeded as described below, are intentionally shown in demo mode.

Enabling this feature intentionally lets **any visitor** sign in as either demo
account, with full access to shared data and operations. Use it only for a demo
instance. It does not create a sessionless bypass: page/API guards, audit identity,
session expiration/rotation, secure cookies, origin protection, and logout all
remain enforced. Demo requests have a separate database-backed limit of 60 per
minute across instances. Disabling the flag hides the UI and returns 404 from the
demo endpoint even when directly requested; it does not revoke already-issued
sessions. Revoke those sessions separately if required. Password sign-in continues
to work with the same two users.


## Public demonstration credentials

For this demonstration application, the user explicitly authorized public demo
passwords on the sign-in screen. Seed them without prompts using:

```sh
npm run auth:provision -- --demo
```

This uses the same transactional provisioning flow to create the Admin and
Operations fixtures in `server/modules/auth/demo-credentials.ts`. These are
**public demonstration credentials**, not private secrets. Only salted scrypt
hashes are stored in the users table. The command never resets data, adds
migrations, silently overwrites other initial accounts, or prints passwords.
Repeat runs keep matching accounts and their existing hashes unchanged.
`--demo` cannot be combined with interactive entry or password rotation.

With `AUTH_DEMO_SIGN_IN=true`, the sign-in page displays the public email/password
for each fixture only if its email, role and stored password hash actually match.
Its “Sign in as” button submits those credentials through normal password login.
You can also type them into the regular sign-in form. Other provisioned accounts
never expose their private passwords. The existing role-based demo endpoint stays
available for configured accounts without public fixture credentials.

Local status: both public demo accounts were seeded and local demo mode enabled.
`AUTH_ORIGIN` is configured locally; the committed example still defaults demo
mode to off. Restart an already-running application if it has not picked up the
local environment change.
