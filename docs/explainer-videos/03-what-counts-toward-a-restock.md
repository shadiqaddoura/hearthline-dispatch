# 03 · What counts toward a restock

**Video:** `03-what-counts-toward-a-restock.mp4` (1:14, no audio)
**README decision:** Only working physical stock counts. Dead units are excluded, reservations aren't subtracted, the 3 June minimums apply, and paper is in rolls with a 2-box minimum of 100 rolls. The import gives 6 vans to restock (P1, V02, V03, V04, V05, V07). Pavel's stale cable minimum no longer triggers.
**Screen:** Restocking → V05 → V04 → Products Catalog

Timings are approximate (±1 s).

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Restocking page; pointer on "Vans to restock (6)". | "Three different restock lists were going around, with three, four and six vans. Each one missed a rule. Hearthline lists six: P1, V02, V03, V04, V05 and V07." |
| 0:08 | V05 is clicked; its pick list opens. | "Let's open V05." |
| 0:14 | Pointer on the "Planned collection" explanation. | "The rule is on the page: minimum minus working units in the van, never below zero. Reserved units still count as being in the van. Broken ones don't." |
| 0:20 | Pointer on the receipt printer row: minimum 3, working 1. | "V05 holds three printers, but two are dead. Only one counts as working, so we collect two." |
| 0:26 | Pointer on "Broken equipment to return": 2 printers with serials. | "The dead ones are listed separately, to go back to the hub. They aren't netted against the pick list." |
| 0:32 | Pointer on thermal paper: minimum 100 rolls. | "Paper is counted in rolls. The two-box minimum is a hundred rolls." |
| 0:38 | Pointer on "1 box + 15 rolls, exactly 65 rolls". | "V05 has thirty-five, so it needs sixty-five. Whole-box rounding is only shown as a labelled alternative." |
| 0:44 | V04 is clicked. | "Now Pavel's van, V04." |
| 0:50 | Pointer on V04's only line, the card reader. | "There's no cable line. His row in the book still had an old cable minimum of twenty, but the 3 June minimums replace it." |
| 0:56 | Products Catalog is opened from the sidebar. | "The agreed minimums live in the catalogue." |
| 1:03 | Pointer on Ethernet cable: van minimum "10 each". | "Ten cables per van. V04 has twelve, so it isn't short." |
| 1:09 | Pointer on thermal paper: "100 rolls (2 boxes)". | "And the paper minimum, a hundred rolls, which is two boxes." |

## What the video can't show

- **Reservations aren't subtracted:** no job is assigned in the imported data, so there are no reservations to show. The video only shows the rule text on the page ("Reserved units still count as in the van").
- **The 3 and 4 van lists, and Pavel's old minimum of 20:** these come from the source material. The app only shows the result (six vans, and a minimum of 10 cables). The import issue that records the ignored minimum (`ROW_MINIMUM_IGNORED`) is available from `GET /api/imports/{id}/issues`, but no screen shows it yet (Imports is marked "Soon").
