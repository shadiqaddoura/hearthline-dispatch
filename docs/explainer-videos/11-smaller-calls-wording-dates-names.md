# 11 · Smaller calls: dates, "today", repair wording, customer names

**Video:** `11-smaller-calls-wording-dates-names.mp4` (0:53, with voiceover from `11-smaller-calls-wording-dates-names.mp3`)
**README decision:** "swap"/"fix" = repair. Dates are day-first (UK), and "today" is the London day. "مطعم زيتون" = Zaytoun Grill (same Riverside branch, flagged). Paper on job rows without a unit is left off and flagged.
**Screen:** intro card → Dispatch → Mezze House → Recorded details → Saffron & Co → the bottom of the request list

The video opens on a white card that states the issue and the decision. After that, each step is a still screen with a teal box around the area the line talks about. No mouse pointer is shown. Times below are where each line starts in the finished video. The values the book used ("04/10", "fix") come from the stock book, not from the screen, and the voiceover says so.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Intro card: the issue and the decision. | "A few smaller calls. First, 'today' means the London day." |
| 0:10 | Dispatch; **the board date: Sun 18 Oct 2026**. | "The board is dated Sunday, the 18th of October." |
| 0:14 | **Mezze House, Old Town (J-26-26579)** selected. | "Dates in the book are day-first, the UK way." |
| 0:17 | Recorded details; **Requested on: Sun 4 Oct 2026**. | "Mezze House was requested on 04/10," |
| 0:21 | **Requested on: Sun 4 Oct 2026**. | "which is the 4th of October, not the 10th of April." |
| 0:24 | **Waiting time: Waiting 14 days**, and the card's **Waiting 14 days**. | "That gives 14 days waiting." |
| 0:27 | **Saffron & Co, Harbour (J-26-26561)** selected. | "In the book, this job's type was just 'fix'." |
| 0:30 | **"J-26-26561 · Repair · zone South"**. | "'Swap' and 'fix' both mean 'repair'," |
| 0:33 | **"J-26-26561 · Repair"**. | "so it comes in as a repair." |
| 0:36 | **The board date: Sun 18 Oct 2026**. | "Back to 'today'." |
| 0:37 | **Brasserie Léon (J-26-26570): Requested today**. | "Brasserie Léon was requested on the 18th of October," |
| 0:41 | **Brasserie Léon: Requested today**. | "so it's requested today." |
| 0:43 | **Casa Verde, Riverside (J-26-26575): Request date is after today**. | "This Casa Verde row has a request date of the 19th." |
| 0:47 | **Casa Verde: Request date is after today**. | "The board says the date is after today, instead of showing a negative wait." |

## What the video can't show

- **The Arabic customer name ("مطعم زيتون" = Zaytoun Grill, same Riverside branch, flagged):** left out of the video. The request simply shows as Zaytoun Grill, Riverside, and the flag that records the match (`CUSTOMER_ALIAS`) is only in the import issues, so there's nothing on screen to point at.
- **The original spellings** ("04/10/2026", "fix"): the app shows the interpreted values. The originals are kept on the imported source rows, and the related import issues are available from `GET /api/imports/{id}/issues`, but no screen shows them yet (Imports is marked "Soon").
- **Paper on job rows without a unit, left off and flagged:** this affects completed job rows from the book, and no screen lists those. The import records `PACK_UNIT_UNCLEAR` for these rows.

## Notes

- Saffron & Co shows as Assigned because of video 10, which assigned it to V05 in the demo database. Its job type is unaffected.
- In Mezze House's recorded details, the review note and the next field run together on screen ("…serial verificationNotes: who is free??"), the same missing line break noted in video 09.
- Each step is held as a single clean frame from the take, and no pointer is in frame.
- The voiceover was recorded as one take, transcribed locally to find where each line starts, and cut at its natural pauses with no change to speed or pitch.
