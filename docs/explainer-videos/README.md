# Explainer videos: decisions where the material disagreed or was silent

One short screen recording per row of the README table [Decisions where the material disagreed or was silent](../../README.md#decisions-where-the-material-disagreed-or-was-silent). Each video has a voiceover script with the same file name (`.md`). The videos have no audio yet: record each script, and the audio can then be added to the matching video.

| # | Decision | Video | Script | Length |
| --- | --- | --- | --- | --- |
| 01 | Is stock the van's or the technician's? | [01-stock-belongs-to-the-van.mp4](01-stock-belongs-to-the-van.mp4) | [script](01-stock-belongs-to-the-van.md) | 0:52, narrated, intro card |
| 02 | Car-park swaps | [02-car-park-swaps-recorded-as-transfers.mp4](02-car-park-swaps-recorded-as-transfers.mp4) | [script](02-car-park-swaps-recorded-as-transfers.md) | 2:15 |
| 03 | What counts toward a restock | [03-what-counts-toward-a-restock.mp4](03-what-counts-toward-a-restock.mp4) | [script](03-what-counts-toward-a-restock.md) | 1:14 |
| 04 | Kitchen displays | [04-kitchen-displays-flagged-for-review.mp4](04-kitchen-displays-flagged-for-review.mp4) | [script](04-kitchen-displays-flagged-for-review.md) | 0:56 |
| 05 | Dead units inside the book's counts | [05-dead-units-moved-to-broken.mp4](05-dead-units-moved-to-broken.mp4) | [script](05-dead-units-moved-to-broken.md) | 1:03 |
| 06 | Serialised stock without serials | [06-serials-needed-before-assignment.mp4](06-serials-needed-before-assignment.mp4) | [script](06-serials-needed-before-assignment.md) | 2:04 |
| 07 | Repeated counts | [07-repeated-counts-latest-wins.mp4](07-repeated-counts-latest-wins.mp4) | [script](07-repeated-counts-latest-wins.md) | 0:55 |
| 08 | V01 in the garage, Khalid in the pool van | [08-v01-garage-khalid-in-pool-van.mp4](08-v01-garage-khalid-in-pool-van.mp4) | [script](08-v01-garage-khalid-in-pool-van.md) | 1:04 |
| 09 | Unclear statuses and the 7 "Restock?" rows | [09-unclear-statuses-held-for-review.mp4](09-unclear-statuses-held-for-review.mp4) | [script](09-unclear-statuses-held-for-review.md) | 1:05 |
| 10 | Booked visits | [10-booked-visits-rerun-through-assignment.mp4](10-booked-visits-rerun-through-assignment.mp4) | [script](10-booked-visits-rerun-through-assignment.md) | 0:57 |
| 11 | Smaller calls | [11-smaller-calls-wording-dates-names.mp4](11-smaller-calls-wording-dates-names.mp4) | [script](11-smaller-calls-wording-dates-names.md) | 1:24 |
| 12 | Hub stock | [12-hub-stock-not-counted.mp4](12-hub-stock-not-counted.mp4) | [script](12-hub-stock-not-counted.md) | 0:47 |

## Parts of the decisions the app doesn't show

Every decision has a video, but these parts aren't visible anywhere in the current app, so the videos don't claim them. Most are recorded as import issues, which are available only from `GET /api/imports/{id}/issues` because the Imports screen is still "Soon".

- **03:** Reservations not being subtracted (the imported data has no reservations; only the rule text on the Restocking page is shown). Also the 3/4-van lists and Pavel's old cable minimum of 20.
- **04:** "Stock and jobs are unaffected": no van holds kitchen displays and no job uses them, so there's nothing to show staying unaffected.
- **05:** The 11th dead unit, held for review on a job with a blank status.
- **07:** The superseded counts and same-day events that weren't applied.
- **08:** V01 jobs after 18 Aug having no stock effect (completed jobs aren't listed anywhere).
- **09:** The 7 "Restock?" rows (they didn't become jobs or restock lines).
- **11:** The original spellings (Arabic customer name, "04/10/2026", "fix"; only the interpreted values are on screen). Also paper on job rows without a unit.
- **12:** The hub as a movement destination (Hub is listed in the Transfer form, but no transfer to it was made).

## How these were recorded

- **Data:** the stock book (`docs/04-van-stock-book.xlsx`) imported into a separate database, `hearthline_video` (same Postgres container). The development database `hearthline` wasn't touched. The app ran with `next dev` on port 3100 against that database, signed in with the demo Operations account.
- **Recording:** real screen captures of the Chrome viewport (1412×794, 30 fps, H.264). The mouse pointer is the real system pointer. Long pauses between steps were cut out; nothing was added.
- **Visible extras:** clicks went through the Claude in Chrome extension. The extension draws a faint pink glow at the page edges and its own small pointer marker, which mostly sits under the real pointer. The extension's "debugging this browser" bar is cropped out.
- **Data changes made on camera** (demo database only): 01 removes V08's driver (put back afterwards), 06 records the test serial `SN-TEST-0001` on a V02 printer, and 02 transfers 2 cables from V03 to V05. To re-record from a clean state, drop and re-create `hearthline_video` and run the import again.
