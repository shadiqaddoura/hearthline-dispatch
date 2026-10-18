# 11 · Smaller calls: dates, "today", repair wording, customer names

**Video:** `11-smaller-calls-wording-dates-names.mp4` (1:24, no audio)
**README decision:** "swap"/"fix" = repair. Dates are day-first (UK), and "today" is the London day. "مطعم زيتون" = Zaytoun Grill (same Riverside branch, flagged). Paper on job rows without a unit is left off and flagged.
**Screen:** Dispatch → Zaytoun Grill (Riverside) → Mezze House → Saffron & Co → bottom of the request list

Timings are approximate (±1 s). The values the book used (the Arabic name, "04/10/2026", "fix") come from the stock book, not from the screen. The script says so.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Dispatch board; pointer on the header date "Sun 18 Oct 2026". | "A few smaller calls. First, 'today' means the London day. The board is dated Sunday 18 October." |
| 0:08 | Zaytoun Grill, Riverside (J-26-26537) is selected. | "This job row in the book names the customer in Arabic, as Matʿam Zaytoun…" |
| 0:14 | Pointer on the heading "Zaytoun Grill — Riverside". | "…which is read as Zaytoun Grill, the same Riverside branch. The import flags it so someone can check." |
| 0:20 | Mezze House (J-26-26579) is selected. | "Dates in the book are day-first, the UK way." |
| 0:26 | "Recorded details & notes" is expanded. | "Mezze House was requested on oh-four slash ten…" |
| 0:34 | Pointer on "Requested on: Sun 4 Oct 2026", "Waiting 14 days". | "…which is 4 October, not 10 April. That gives fourteen days waiting." |
| 0:39 | The request list scrolls, then Saffron & Co (J-26-26561) is selected (0:49). | "In the book this job's type was just 'fix'. 'Swap' and 'fix' both mean repair…" |
| 0:56 | Pointer on "J-26-26561 · Repair". | "…so it comes in as a Repair." |
| 1:01 | The list scrolls to the bottom. | "Back to 'today'." |
| 1:14 | Pointer on Brasserie Léon: "Requested today". | "Brasserie Léon was requested on 18 October, so it's 'requested today'." |
| 1:19 | Pointer on Casa Verde (J-26-26575): "Request date is after today". | "This Casa Verde row has a request date of the 19th. The board says the date is after today instead of showing a negative wait." |

## What the video can't show

- **The original spellings** ("مطعم زيتون", "04/10/2026", "fix"): the app shows the interpreted values. The originals are kept on the imported source rows, and `CUSTOMER_ALIAS` and similar issues are available from `GET /api/imports/{id}/issues`, but no screen shows them yet (Imports is marked "Soon").
- **Paper on job rows without a unit, left off and flagged:** this affects completed job rows from the book, and no screen lists those. The import records `PACK_UNIT_UNCLEAR` for these rows.
