# 09 · Unclear statuses are held for review

**Video:** `09-unclear-statuses-held-for-review.mp4` (1:05, no audio)
**README decision:** Unclear statuses (blank, "pending parts") and the 7 "Restock?" rows are kept as written and held for review, with no stock effect. Guessing was the problem the brief describes.
**Screen:** Dispatch → Pizza Quarter (Mall) → Recorded details → Zaytoun Grill (Airport Road) → Recorded details

Timings are approximate (±1 s).

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Dispatch board; pointer moves to Pizza Quarter, Mall, which is then selected. | "Some job rows in the book have a status nobody can interpret, so the app doesn't guess." |
| 0:12 | Pointer on "Import needs review: check the recorded details before assigning". | "This Pizza Quarter install is marked 'Import needs review'." |
| 0:18 | "Recorded details & notes" is expanded. | "The recorded details show why…" |
| 0:26 | Pointer on "Imported status "(blank)" is unclear". | "…the status in the book was blank. We can't tell whether the work was done, so it stays open and changes no stock." |
| 0:33 | The request list scrolls down; Zaytoun Grill, Airport Road is selected. | "Here's another one: Zaytoun Grill at Airport Road." |
| 0:47 | "Recorded details & notes" is expanded. | "Its status was written as 'pending parts'." |
| 0:54 | Pointer on "Imported status "pending parts" is unclear". | "That isn't a status the system can act on, so it's held for review too." |
| 1:00 | Pointer on the header: "16 waiting · 0 assigned / in progress". | "Nothing is assigned and nothing is reserved. A person decides what these rows mean before they affect stock." |

## What the video can't show

- **The 7 "Restock?" rows:** these didn't become jobs or restock lines, so they don't appear on any screen. The import records each one as `UNCLEAR_RESTOCK_ROW`, available from `GET /api/imports/{id}/issues`. The Imports screen is marked "Soon".
- There's no screen action to resolve a held job as "already done" (README, "Not done yet").
