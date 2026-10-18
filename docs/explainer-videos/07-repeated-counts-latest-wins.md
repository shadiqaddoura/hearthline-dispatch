# 07 · Repeated counts: the latest count wins

**Video:** `07-repeated-counts-latest-wins.mp4` (1:04, with voiceover from `07-repeated-counts-latest-wins.mp3`)
**README decision:** Use the latest count per van and product by date (not row order), and never add counts together. Only events strictly after that date are applied. Same-day events are reported, not applied. The sheet appends older counts at the bottom (V05 terminals).
**Screen:** intro card → Inventory filtered to Van V05 → POS terminal 15in details → movement history → Correct count → V05 table → movement history with the correction

The video opens on a white card that states the issue and the decision. After that, each step is a still screen with a teal box around the area the line talks about. No mouse pointer is shown. Times below are where each line starts in the finished video.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Intro card: the issue and the decision. | "The stock book has some vans counted more than once, and the rows aren't in date order." |
| 0:10 | Inventory filtered to Van V05; **the POS terminal 15in row**. | "V05's POS terminals are the example." |
| 0:13 | **The POS terminal 15in row**. | "The book has a count of three from the fifth of October and a count of two from the twelfth of October." |
| 0:19 | **POS terminal 15in: working physical 2**. | "Hearthline shows two." |
| 0:21 | **Working physical 2**. | "It takes the latest count by date and doesn't add the counts together, which would give five." |
| 0:27 | POS terminal 15in details; **the panel title**. | "Here's where that number comes from." |
| 0:29 | Movement history; **the single OPENING BALANCE row: 2 working**. | "There's a single opening balance," |
| 0:31 | **Reference / reason: "Stock book count of 2026-10-12"**. | "from the stock book count of the twelfth of October." |
| 0:34 | **Stock summary: working physical 2**. | "What if the real count in the van is different?" |
| 0:36 | **The OPENING BALANCE row**. | "You don't edit the book or add another count row." |
| 0:40 | **The Correct count button**. | "You correct the count." |
| 0:42 | Correct count form; **Resulting physical count: 3**. | "Enter what's physically in the van." |
| 0:44 | **Resulting physical count: 3**. | "Here, three terminals." |
| 0:46 | **Reason or reference: "Recount in the van on 18 Oct: 3 terminals (demo)"**. | "A reason is required, so every correction can be explained." |
| 0:50 | Inventory, V05; **POS terminal 15in: working physical 3**. | "Now V05 shows three terminals," |
| 0:53 | **Awaiting serial verification: 3**. | "and all three still need their serials." |
| 0:55 | POS terminal details; **movement history: CORRECTION and OPENING BALANCE rows**. | "The history keeps both." |
| 0:57 | **OPENING BALANCE: 2**. | "The opening balance of two" |
| 0:59 | **CORRECTION: +1**. | "and a correction of plus one," |
| 1:01 | **The correction's reason**. | "with when and why." |

## What the video can't show

- **The superseded count of 3 (5 October) and the rule for same-day events:** the app records these as import issues (`COUNT_SUPERSEDED`, `SAME_DAY_AS_COUNT`), available from `GET /api/imports/{id}/issues`. No screen shows import issues yet (Imports is marked "Soon"), so the video only shows the count that was used and its date.

## Notes

- **The correction is demo data:** it was recorded in the demo database (`hearthline_video`) only. V05's POS terminals went from 2 to 3, and the reason was "Recount in the van on 18 Oct: 3 terminals (demo)". The extra terminal has no serial, so it was added as needing verification and isn't available to jobs.
- Each step is held as a single clean frame from two takes (before and after the correction), and no pointer is in frame. The movement history was scrolled sideways so the operation and the reason are both readable.
- The voiceover was recorded as one take. Each line was cut at its natural pause and placed on its step, with no change to speed or pitch.
