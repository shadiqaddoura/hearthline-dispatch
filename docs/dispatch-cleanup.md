# Dispatch simplification

Branch: `codex/dispatch-workspace-cleanup`, starting at main `1904792`.

## Decisions

The current Fluent 2 interface already had the right business operations. The problem was presentation: a repeated request status, the same blocker described several times, and stock and job details occupying the comparison area. A fresh desktop and mobile browser inspection confirmed this before implementation.

- The queue keeps the server's oldest-first order. Customer and branch identify the request; a consistent waiting-age position makes the oldest requests easier to scan. One blocker badge remains. Assignment status is only repeated where it distinguishes assigned from in-progress work.
- The selected request keeps its identity, waiting age and exact required quantities visible. The live eligibility summary gives the next step. Original request date, date caveats, imported status, full recorded blocker and notes remain in **Recorded details & notes**.
- Vans use compact comparison rows: code, technician, usual zone, today's workload, eligibility and one short reason. **Inventory & reasons** reveals all backend reasons, stock, plate/status notes and job lists. Working, reserved and available quantities remain separate, with broken, unverified and imported-negative warnings.
- Inactive vehicles are in a separate **Off-road / unavailable** section. Server ranking is preserved within each group. Eligibility still comes entirely from the backend; a different zone never disqualifies a van.
- A blocked assignment shows one summary and collapsed per-van reasons. Schedule and operator fields appear after selecting an eligible van. Final confirmation, stale-state handling and server revalidation are unchanged.
- Mobile keeps Details and Van choices inside one request workspace. The drawer header retains request context; its footer retains the one assignment/scheduling action. Switching tabs no longer requires leaving the request to visit the fleet overview.

No server, inventory, reservation, authentication, Products, Restocking or Imports implementation changed. The focus-manager provider is unchanged.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Passed (`npm run typecheck`) |
| Lint | Passed (`npm run lint`) |
| Production build | Passed with the disposable database URL configured |
| UI component tests | 51 passed across 7 files |
| Unit and integration tests | 147 passed across 18 files, in a new disposable database |
| Desktop browser | 1440 × 1000; request selection, compact comparison, expansion and keyboard interaction |
| Mobile browser | 390 × 844; Details/Van choices, persistent context/action, blocked dialog, Escape and focus restoration |
| Successful browser assignment | Invented `QA-DISPATCH-ASSIGN` request, 1 cable, assigned to V05 with explicit confirmation |
| Successful browser schedule update | Changed from 2099-10-18 / #1 to 2099-10-20 / #2; persisted request date remained 2026-10-02 and the active reservation was identical |

The browser preview used only `dispatch_cleanup_test`, created for this task and loaded from the assessment workbook. The server suite used a separate new database, `dispatch_cleanup_checks`. Existing development data was not used for mutations or destructive tests. After screenshots may include the additional invented QA request; it is not application demo data.

The component tests still cover stale eligibility responses, server refusals, duplicate clicks and unanswered-save reconciliation. Added checks cover the compact blocked dialog, conditional assignment fields, mobile workspace switching and imported-negative inventory warnings. jsdom has no layout engine, so the mobile test explicitly focuses a drawer control to activate Fluent's modal focus manager; real-browser behavior was checked separately.

The first build was prevented from opening a worker port by the execution sandbox. An elevated retry retained the error; clearing this worktree's Turbopack build cache allowed the build to proceed. A subsequent build with the required database configuration passed. No application workaround or dependency/configuration change was introduced. CodeRabbit review was unavailable because its CLI was signed out; local source review, automated checks and browser checks were performed.

## Evidence

| View | Before | After |
| --- | --- | --- |
| Desktop, selected imported request | [Before](../output/playwright/before-desktop.png) | [After](../output/playwright/after-desktop.png) |
| Mobile details | [Before](../output/playwright/before-mobile.png) | [After](../output/playwright/after-mobile-details.png) |
| Mobile van choices | — | [Van choices](../output/playwright/after-mobile-vans.png) |
| Mobile expanded inventory | — | [Inventory and reasons](../output/playwright/after-mobile-inventory.png) |
| No eligible van | — | [Compact blocked dialog](../output/playwright/after-mobile-blocked.png) |
| Assignment confirmation | — | [Confirmation](../output/playwright/assignment-confirmation.png) |
| Saved assignment | — | [Saved](../output/playwright/assignment-saved.png) |
| Saved schedule | — | [Saved](../output/playwright/schedule-saved.png) |

This chat records the implementation decisions and checks. No AI session export has been created. Changes remain local; nothing was merged or pushed.

## Follow-up: structured product shortages

Expanded van details now merge product shortage explanations into the existing required-products section. Desktop uses a Fluent table with product name, secondary SKU, Needed, Available and Shortfall columns. Mobile uses product cards with the same labelled quantities. Working, reserved and broken figures stay separate; the complete van inventory remains below.

The eligibility response supplies shortage quantities where present. Unverified stock is shown separately and never subtracted from the assignable shortfall. For Pizza Quarter / Mall on V04, the card reader shows **needed 2, available 0, shortfall 2, unverified 1**. This does not promise that verifying one unit covers both required units. Assigned work, which is not checked for new-work eligibility, shows “Not checked” rather than inventing a shortfall against its own reservations.

Removed the semicolon-separated product paragraphs. Vehicle and driver reasons remain, as do recorded import warnings. The same comparison is used inside assignment choices, including expanded unavailable-van reasons.

Verification: 29 targeted UI tests passed (board, assignment and product comparison), plus TypeScript and lint. Browser checked V04 for the selected Pizza Quarter / Mall request at 1440 × 1000 and 390 × 844. At mobile width, the page measured 390px and the drawer content 389px: no horizontal overflow. No backend code, eligibility decisions or database records changed. The preview remains available on port 3107.

- [V04 desktop product comparison](../output/playwright/v04-comparison-desktop.png)
- [V04 mobile comparison in request context](../output/playwright/v04-comparison-mobile.png)

### Stock columns and full-inventory title

Required products retain the Product / Needed / Available / Shortfall comparison. Numeric stock breakdowns no longer appear as prose under product names. The full van inventory has a visible **Full inventory on {van}** heading and the same accessible table name, with Product / Working / Reserved / Available / Broken / Unverified columns. Mobile renders those same figures as labelled product cards. Imported-negative working counts remain visible with a recount warning.

Assignment dialogs expose required-product stock through **Stock details**; the board uses its existing full-inventory section instead of duplicating another stock dataset. Product names and SKUs remain identifiable in both sections.

Verification: 32 targeted UI tests passed, including separate condition-count columns, the visible inventory heading, expandable required-product stock, mobile numeric labels and negative-count warnings. TypeScript and lint passed. V04 desktop and mobile rendering was checked in the running preview, with no database mutations or backend changes.

- [Updated clean required-products comparison](../output/playwright/v04-comparison-desktop.png)
- [Titled full inventory, desktop](../output/playwright/v04-full-inventory-desktop.png)
- [Titled full inventory, mobile](../output/playwright/v04-full-inventory-mobile.png)
