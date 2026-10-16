# Hearthline Dispatch — backend foundation

Milestone 1 of the van stock and dispatch system: database, business rules, import of the stock book, and an HTTP API. There is deliberately no UI yet.

## Run it

Needs Node 20+ and Docker.

```bash
npm install                      # also generates the Prisma client
cp .env.example .env
npm run db:up                    # Postgres 17 on :5433 (dev + test databases)
npm run db:migrate               # apply migrations
npm run import:book -- docs/04-van-stock-book.xlsx
npm run dev                      # API at http://localhost:3000/api
```

Checks: `npm test` (uses and wipes `hearthline_test`), `npm run typecheck`, `npm run lint`, `npm run build`.
The import runs once into an empty database; to load it again run `npm run db:reset` first.

## Architecture

One Next.js app (App Router, TypeScript). Route Handlers are the API; all logic lives in server-only modules.

```
app/api/**/route.ts   HTTP only: validate with a contract → call one service → { data } | { error }
lib/contracts/        Zod request schemas + response types, shareable with the future UI
server/http/          AppError (code → HTTP status), handle(), readJson()
server/db/            Prisma client, runInTransaction(), row-lock helpers
server/modules/
  fleet/              vans, drivers, van status
  inventory/          availability rules, stock ledger, transfers, corrections, serial verification
  jobs/               create, schedule, start, cancel, complete
  dispatch/           van eligibility, assign/reassign, blocking reasons, dispatch board
  restocking/         restock formula, pick quantities, one open restock job per van
  import/             stock-book pipeline (independent of HTTP)
scripts/import-book.ts
prisma/schema.prisma, prisma/migrations/
tests/unit, tests/integration
```

Each module has a `*.service.ts` (business rules, transactions) and, where it helps, a `*.repository.ts` (queries) or a pure file (`availability.ts`, `eligibility.ts`, `restock-calculator.ts`, `pick-quantity.ts`, `import/plan.ts`) that holds the rule on its own so it can be tested without a database.

**How stock is represented.** Four facts are stored separately, so nothing is double-counted:

| Fact | Where |
| --- | --- |
| Physical quantity | `StockBalance` per location × product × condition (`WORKING` / `BROKEN`) |
| Serial verification | `EquipmentUnit.verification` (serialised products: one row per physical unit) |
| Reservations | `Reservation` (promised to a job; never subtracted from the balance) |
| History | `StockMovement` (every balance change, with both ends) |

`available = assignable working stock − active reservations`, where "assignable" means verified units for serialised products. Broken stock is never available.

**One writer.** `inventory/stock-ledger.ts#moveStock` is the only code that changes balances. In the caller's transaction, it updates the balance, the unit rows, and writes the movement.

**Concurrency.** Every operation that affects availability locks rows in a fixed order: job → van locations (sorted by id) → restock job. "Check availability, then reserve" therefore runs one transaction at a time per van, and reassignments in opposite directions cannot deadlock. The concurrency tests fail if the location lock is removed (checked). Completion locks the job first; a completed job returns `alreadyCompleted: true` and touches nothing. `JobCompletion.jobId` is also unique as a backstop.

**Blocking reasons** (`NO_ELIGIBLE_VAN`, `UNITS_NEED_VERIFICATION`, `IMPORT_NEEDS_REVIEW`, and `RESERVATION_SHORTFALL` for assigned jobs whose van no longer covers their reservations) are separate from job status. Open requests and assigned jobs are re-evaluated after every stock or reservation change. This runs after the change commits, in its own transaction, so it can neither deadlock with nor roll back the operation. Dispatch stays manual: nothing is auto-assigned.

## Decisions where the material disagreed or was silent

| Question | Decision | Why |
| --- | --- | --- |
| Is stock the van's or the technician's? (Noor vs Faris) | The van's. Changing driver moves nothing; moving stock is a recorded transfer. | The hub issues against plates and counts by vehicle; the restock list must go to the right van. |
| Car-park swaps (Daniel vs Noor) | Allowed, and recorded as one movement naming both vans. | Forbidding them didn't stop them; it produced V03's −2 terminals. |
| What counts toward a restock | Working physical stock only: dead units excluded, reservations not subtracted, 3 June minimums (the board says they supersede), paper in rolls with a 2-box minimum = 100 rolls. | Each of the three numbers (3/4/6 vans) was missing one of these. The import gives **6 vans**: P1, V02, V03, V04, V05, V07. Pavel's stale cable minimum no longer triggers. |
| Kitchen displays | Automatic van restocking off, flagged for review. Stock and jobs are unaffected. | Only the hub manager wants them off the list; nobody has agreed. |
| Dead units inside the book's counts | Identified by serial (pulled out minus dropped at hub) and moved from working to broken. | Faris says they get counted. This reproduces Casa Verde (V05: 3 printers, 2 dead) and Faris's 11 dead units (10 placed, plus 1 on a job with a blank status, held for review). |
| Serialised stock without serials | Imported as "needs verification" and not assignable until a serial is recorded (`POST /api/units/verify`). | This is the Casa Verde failure mode. **Consequence:** straight after import, every booked job needing hardware is blocked with `UNITS_NEED_VERIFICATION` and a list of what to verify. Recording serials at the next count unblocks them. |
| Repeated counts | Latest count per van/product by date (not row order); never summed. Only events strictly after that date are applied; same-day events are reported, not applied. | The sheet appends older counts at the bottom (V05 terminals). |
| V01 in the garage, Khalid in the pool van | V01's stock stays where the book says, flagged. Khalid is recorded as driving P1 (from the Read me). V01 jobs after 18 Aug have no stock effect. | Inventing the unrecorded move would hide it. Instead P1 goes negative on three products, which is flagged. |
| Unclear statuses (blank, "pending parts") and the 7 "Restock?" rows | Kept as written, held for review; no stock effect. | Guessing was the problem the brief describes. |
| Booked visits | Re-run through normal assignment after import. | A booking only becomes an assignment if the van can actually do it. |
| Smaller calls | "swap"/"fix" = repair (brief). Dates are day-first (UK); "today" is the London day. "مطعم زيتون" = Zaytoun Grill (same Riverside branch; flagged). Paper on job rows without a unit is left off and flagged. | |
| Hub stock | Not counted. The hub is a location that movements can name. | There are no hub counts to start from. |

## Import result (`docs/04-van-stock-book.xlsx`)

192 rows preserved with sheet and row number. 78 counts used (6 superseded), 99 movements, 51 completed jobs, 16 open requests, 6 open restock jobs. Issues: 50 info, 47 warnings, 1 error (V03 PRN-K, quantity "-"). Every issue links to its original row: `GET /api/imports/{id}/issues`.

## API

| | |
| --- | --- |
| `GET /api/dispatch/board?date=` | Open requests with days waited; each van's stock, driver and jobs that day |
| `GET/POST /api/jobs`, `GET /api/jobs/{id}` | List (`?status`, `?open=true`), create, read |
| `GET /api/jobs/{id}/eligible-vans` | Vans ranked: eligible → same zone, with reasons |
| `POST /api/jobs/{id}/assign` · `reassign` · `start` · `cancel` · `complete`; `PATCH …/schedule` | Lifecycle |
| `GET /api/vans`, `GET/PATCH /api/vans/{id}`, `GET /api/vans/{id}/stock` | Fleet, driver/status changes, stock with availability |
| `POST /api/stock/transfers` · `corrections`, `GET /api/stock/movements` | Inventory |
| `POST /api/units/verify` | Record a counted unit's serial |
| `GET /api/restock-jobs`, `POST /api/restock-jobs/{id}/collect`, `POST /api/restock-jobs/recalculate` | Pick lists (with box conversion), collection, broken returns |
| `GET/POST /api/imports`, `GET /api/imports/{id}/issues` | Import (multipart `file`) and the rows that did not fit |
| `GET /api/products` · `customers` · `technicians` | Reference data |

There is no authentication yet, so write requests name their actor (`assignedBy`, `correctedBy`, …).

## Tests

58 tests: 24 unit (availability, restock formula and pick quantities, normalisation, import snapshot handling) and 34 integration tests against real Postgres. The integration tests cover reservations, cancellation, reassignment, completion retries (sequential and concurrent), concurrent assignments, transfers, corrections, driver changes, the kitchen-display policy, and restocking.

## Not done yet / known limits

- No screens: dispatch board, restock list, technician phone view.
- No authentication or roles.
- No endpoint to resolve an imported job held for review. It can be assigned or cancelled, but not marked "already done" without a stock effect.
- Completion may use a job's own reservation plus free stock, never stock reserved for another job; recording work that physically used another job's units means reassigning that job first. A lower stock count can still leave assigned jobs short: they are flagged `RESERVATION_SHORTFALL` (all jobs sharing the shortfall, since which one runs short depends on order), not cancelled or reassigned.
- Reservations are by quantity, not by serial. There's no "unit found broken" operation; use a correction.
- Hub shelves aren't counted, and the next-working-day promise isn't measured yet (`requestedOn`, `scheduledFor` and `completedOn` are stored for it).
- The import is one-shot into an empty database. Serials on multi-product job rows stay on the source row, because the sheet doesn't say which serial belongs to which product.
- Blocking reasons are recomputed for all open requests after each change. That's fine at this size, but would need targeting at scale.
- Prisma 7's pg adapter logs a pg deprecation warning (parallel queries inside a transaction). This is upstream and harmless on pg 8.
- Vitest is pinned to 4.x because the project pins `@types/node` 20.
