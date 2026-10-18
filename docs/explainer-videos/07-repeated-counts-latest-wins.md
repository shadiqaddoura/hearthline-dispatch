# 07 · Repeated counts: the latest count wins

**Video:** `07-repeated-counts-latest-wins.mp4` (0:55, no audio)
**README decision:** Use the latest count per van and product by date (not row order), and never add counts together. Only events strictly after that date are applied. Same-day events are reported, not applied. The sheet appends older counts at the bottom (V05 terminals).
**Screen:** Inventory → filter Van V05 → POS terminal 15in details → movement history

Timings are approximate (±1 s).

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Inventory, scrolling to the stock table. | "The stock book has some vans counted more than once, and the rows aren't in date order." |
| 0:14 | Location filter changes to Van V05. | "V05's POS terminals are the example. The book has a count of three from 5 October and a count of two from 12 October." |
| 0:29 | Pointer on V05's POS terminal row: working 2. | "Hearthline shows two. It takes the latest count by date and doesn't add the counts together, which would give five." |
| 0:33 | POS terminal is clicked; its details open. | "Here's where that number comes from." |
| 0:43 | Movement history scrolls sideways to show the reason column. | "There's a single opening balance…" |
| 0:48 | Pointer on "Stock book count of 2026-10-12". | "…from the stock book count of 12 October. The older count is kept on its source row for reference, but it doesn't affect stock." |

## What the video can't show

- **The superseded count of 3 (5 October) and the rule for same-day events:** the app records these as import issues (`COUNT_SUPERSEDED`, `SAME_DAY_AS_COUNT`), available from `GET /api/imports/{id}/issues`. No screen shows import issues yet (Imports is marked "Soon"), so the video only shows the count that was used and its date.
