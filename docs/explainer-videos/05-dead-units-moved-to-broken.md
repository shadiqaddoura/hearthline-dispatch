# 05 · Dead units inside the book's counts

**Video:** `05-dead-units-moved-to-broken.mp4` (1:03, no audio)
**README decision:** Dead units are identified by serial (pulled out minus dropped at the hub) and moved from working to broken. This reproduces Casa Verde (V05: 3 printers, 2 dead) and Faris's 11 dead units (10 placed, plus 1 on a job with a blank status, held for review).
**Screen:** Inventory → Condition: Broken stock → V05 receipt printer details

Timings are approximate (±1 s).

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Inventory, scrolling to the stock table. | "Faris told us the van counts include dead units. A dead printer still sits in the van and gets counted." |
| 0:08 | Condition filter switches to "Broken stock". | "So the import finds them by serial: every unit pulled out on a job that never reached the hub." |
| 0:15 | Broken-stock list settles; pointer moves down it. | "These are the broken units the import placed: V02, V04, V05, V06 and V07. Ten in total." |
| 0:25 | Pointer on V05 receipt printer: Broken 2. | "Here's Casa Verde's case on V05: the count said three printers, and two were dead." |
| 0:31 | V05 receipt printer is clicked; its details open. | "Let's open it." |
| 0:37 | Pointer on the stock summary: working 1, broken 2. | "One working, two broken. Broken stock is never available to a job." |
| 0:43 | Pointer on the equipment units: SN-401485 and SN-401493, BROKEN. | "Each dead unit is tracked by serial, so we know exactly which two they are." |
| 0:47 | Panel scrolls to the movement history. | "And the history says why." |
| 0:52 | Pointer on "Pulled out on J-26-26518 (2026-10-08)". | "Each one was pulled out on a job and never dropped at the hub." |
| 0:58 | Pointer on "Stock book count of 2026-10-12", quantity 1, working. | "So the opening count keeps one working printer. The other two are recorded as broken, not counted as stock." |

## What the video can't show

- **The 11th dead unit:** it's on Zaytoun Grill's job J-26-26537, whose status is blank. That job shows "Import needs review" on the Dispatch board (video 09), but no screen names the faulty serial (SN-401629) or says it is held back. That detail is only in the import issues (`FAULTY_NOT_APPLIED`, via `GET /api/imports/{id}/issues`).
