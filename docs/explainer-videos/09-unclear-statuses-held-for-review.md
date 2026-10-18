# 09 · Unclear statuses are held for review

**Video:** `09-unclear-statuses-held-for-review.mp4` (0:44, with voiceover from `09-unclear-statuses-held-for-review.mp3`)
**README decision:** Unclear statuses (blank, "pending parts") and the 7 "Restock?" rows are kept as written and held for review, with no stock effect. Guessing was the problem the brief describes.
**Screen:** intro card → Dispatch → Pizza Quarter (Mall) → Recorded details → Zaytoun Grill (Airport Road) → Recorded details

The video opens on a white card that states the issue and the decision. After that, each step is a still screen with a teal box around the area the line talks about. No mouse pointer is shown. Times below are where each line starts in the finished video.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Intro card: the issue and the decision. | "Some job rows in the book have a status nobody can interpret, so the app doesn't guess." |
| 0:10 | Pizza Quarter, Mall (J-26-26438) selected; **"Import needs review" on its card and "Import needs review — check the recorded details before assigning"**. | "This Pizza Quarter install is marked 'Import needs review'." |
| 0:14 | Recorded details & notes expanded; **the recorded details**. | "The recorded details show why." |
| 0:16 | **"Import needs review: Imported status "(blank)" is unclear"**. | "The status in the book was blank." |
| 0:19 | **Pizza Quarter's card: still waiting, 55 days**. | "We can't tell whether the work was done, so it stays open and changes no stock." |
| 0:24 | **Zaytoun Grill, Airport Road (J-26-26566)** selected. | "Here's another one." |
| 0:25 | **"Zaytoun Grill — Airport Road"**. | "Zaytoun Grill at Airport Road." |
| 0:28 | Recorded details expanded; **Imported status "pending parts"**. | "Its status was written as 'pending parts'." |
| 0:31 | **"Import needs review: Imported status "pending parts" is unclear"** and the card's **Import needs review**. | "That isn't a status the system can act on, so it's held for review too." |
| 0:36 | **"16 waiting · 0 assigned / in progress"**. | "Nothing is assigned and nothing is reserved." |
| 0:39 | **Imported status and the review note**. | "A person decides what these rows mean before they affect stock." |

## What the video can't show

- **The 7 "Restock?" rows:** these didn't become jobs or restock lines, so they don't appear on any screen. The import records each one as `UNCLEAR_RESTOCK_ROW`, available from `GET /api/imports/{id}/issues`. The Imports screen is marked "Soon". The intro card mentions them, but the voiceover doesn't.
- There's no screen action to resolve a held job as "already done". It can be assigned or cancelled, but there is no endpoint that marks it done without a stock effect.

## Notes

- In Zaytoun Grill's recorded details, the review note and the next field run together on screen: "…is unclearNotes: router drops daily" (no space or line break before "Notes:"). It may be worth fixing in the request details layout.
- Each step is held as a single clean frame from the take, and no pointer is in frame.
- The voiceover was recorded as one take, transcribed locally to find where each line starts, and cut at its natural pauses with no change to speed or pitch.
