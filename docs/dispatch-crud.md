# Dispatch request CRUD

Create and edit use the same right-side Fluent `OverlayDrawer` pattern as Products details: medium width (592px capped at the viewport), header dismissal, scrollable body, footer actions, and Fluent overlay/motion/focus handling. The form stays mounted during its closing transition and starts fresh on its next opening. Narrow screens use the viewport width. Escape, overlay dismissal and Cancel protect unsaved changes; pending mutations prevent dismissal and duplicate submissions.

Request data uses the existing customer/branch and product catalogues. Duplicate product lines are rejected consistently by the shared client/server schema. Creation does not reserve stock. Request-date corrections are explicit edits, separate from assignment and scheduling.

Updates lock the job before the van location. Assigned requirement changes release old reservations and reuse assignment's eligibility/reservation service in the same transaction. Failure rolls back the request and reservations. Metadata-only changes retain reservations. The UI supplies the version it opened; stale edits are refused. Execution and historical records cannot be edited.

Deletion is for unused, unassigned requests only. Server-computed explanations appear in the confirmation dialog. The service rechecks under lock. All reservation history, movements, completions and protected imports prevent deletion. A database trigger and restrictive stock-movement foreign key protect direct deletion as well. Only request items cascade; operational history never does. Cancellation is explicitly separate and reuses the existing atomic reservation-release operation.

## Migration

`20261017130000_protect_request_history` must be deployed before enabling this feature on the application database. It was applied only to `hearthline_test` during verification. The existing application database was not reset, migrated or used for mutation checks.

## Verification

- Passed: TypeScript, ESLint, final production build with `npm run build -- --webpack`. Earlier default Turbopack builds passed; the final default build/retry was blocked by an environment permission error while its CSS worker bound a local port. No build configuration was changed.
- Passed: 35 backend integration tests across request CRUD, dispatch and scheduling, using only `hearthline_test`.
- Covered: create/edit/delete without stock movement, assigned reservation replacement and rollback, serial verification, concurrent stock promises, stale edits, validation, scheduling/date preservation, cancellation and direct database deletion restrictions, completed work and import/movement preservation.
- CodeRabbit review was unavailable because its CLI was signed out.
- No automated UI/component/browser tests were created, modified or run.
- Browser interaction was unavailable: computer-use reported no browsers/apps and a failed native connection. Visual equivalence, desktop/mobile presentation, scrolling, keyboard navigation, focus restoration, sheet dismissal, unsaved-change handling and mutation/error feedback remain unverified through a browser.

## Manual browser follow-up (isolated database only)

Use a separate application instance pointing to a dedicated test database with invented customers, branches, products and stocked vans. Never point fixture/reset helpers at the application database.

1. Compare Products details with New/Edit request at desktop and narrow widths. Check right-side motion, overlay, spacing, scrolling, header/footer and focus.
2. Create a request, verify its queue entry/details and unchanged stock/reservations, then reopen and edit it.
3. Try missing fields, zero/fractional quantities and repeated products. Check errors retain entered values. Change a request in another session and confirm stale-edit rejection.
4. Try Cancel, close, overlay dismissal and Escape with unsaved values; exercise both Keep editing and Discard changes. Check return focus.
5. Assign after editing, schedule and reschedule. Confirm the original request date stays unchanged. Change assigned requirements within stock, then beyond stock; confirm rollback on rejection.
6. Delete an unused request with explicit confirmation. Try protected assigned/imported/executed requests and check explanations. Cancel assigned work separately and confirm released reservations and retained history.
7. Disconnect or provoke a rejected server save and check recoverable feedback, retained input and duplicate-click protection.
