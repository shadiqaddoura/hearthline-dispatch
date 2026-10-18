# 05 · Dead units inside the book's counts

**Video:** `05-dead-units-moved-to-broken.mp4` (1:01, with voiceover from `05-dead-units-moved-to-broken.mp3`)
**README decision:** Dead units are identified by serial (pulled out minus dropped at the hub) and moved from working to broken. This reproduces Casa Verde (V05: 3 printers, 2 dead) and Faris's 11 dead units (10 placed, plus 1 on a job with a blank status, held for review).
**Screen:** intro card → Inventory (Condition: Broken stock) → V05 receipt printer details → movement history

The video opens on a white card that states the issue and the decision. After that, each step is a still screen with a teal box around the area the line talks about. No mouse pointer is shown. Times below are where each line starts in the finished video.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Intro card: the issue and the decision. | "Faris told us the van counts include dead units. A dead printer still sits in the van and gets counted. So the import finds them by serial: every unit pulled out on a job that never reached the hub." |
| 0:15 | Inventory filtered to broken stock; **the Broken column**. | "These are the broken units the import placed: V02, V04, V05, V06 and V07. Ten in total." |
| 0:27 | **V05 Receipt printer 80mm: broken 2**. | "Here's Casa Verde's case on V05: the count said three printers, and two were dead." |
| 0:33 | V05 receipt printer details; **the panel title**. | "Let's open it." |
| 0:35 | **Stock summary: working 1, broken 2**. | "One working, two broken. Broken stock is never available to a job." |
| 0:40 | **Equipment units SN-401485 and SN-401493: BROKEN**. | "Each dead unit is tracked by serial, so we know exactly which two they are." |
| 0:46 | **Movement history**. | "And the history says why." |
| 0:48 | **BROKEN COLLECTION rows: "Pulled out on J-26-26518 / J-26-26516"**. | "Each one was pulled out on a job and never dropped at the hub." |
| 0:52 | **OPENING BALANCE: 1 working, "Stock book count of 2026-10-12"**. | "So the opening count keeps one working printer. The other two are recorded as broken, not counted as stock." |

## What the video can't show

- **The 11th dead unit:** it's on Zaytoun Grill's job J-26-26537, whose status is blank. That job shows "Import needs review" on the Dispatch board (video 09), but no screen names the faulty serial (SN-401629) or says it is held back. That detail is only in the import issues (`FAULTY_NOT_APPLIED`, via `GET /api/imports/{id}/issues`).

## Notes

- Each step is held as a single clean frame from the take, and no pointer is in frame. The movement history was scrolled sideways so the reasons are readable.
- The voiceover was recorded as one take. Each line was cut at its natural pause and placed on its step, with no change to speed or pitch.
