# 03 · What counts toward a restock

**Video:** `03-what-counts-toward-a-restock.mp4` (1:29, with voiceover from `03-what-counts-toward-a-restock.mp3`)
**README decision:** Only working physical stock counts. Dead units are excluded, reservations aren't subtracted, the 3 June minimums apply (the board says they supersede), and paper is counted in rolls, with a 2-box minimum of 100 rolls. The import gives **6 vans**: P1, V02, V03, V04, V05 and V07. Pavel's stale cable minimum no longer triggers.
**Screen:** intro card → Restocking → V05 → V04 → Products Catalog

The video opens on a white card that states the issue and the decision. After that, each step is a still screen with a teal box around the area the line talks about. No mouse pointer is shown. Times below are where each line starts in the finished video.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Intro card: the issue and the decision. | "Three different restock lists were going around, with three, four and six vans. Each one missed a rule." |
| 0:11 | Restocking; **Vans to restock (6)**. | "Hearthline lists six: P1, V02, V03, V04, V05 and V07." |
| 0:22 | **V05** in the list. | "Let's open V05." |
| 0:25 | V05 pick list; **the "Planned collection" rule**. | "The rule is on the page: minimum minus working units in the van, never below zero. Reserved units still count as being in the van. Broken ones don't." |
| 0:36 | **Receipt printer 80mm**: minimum 3, working 1, to collect 2. | "V05 holds three printers, but two are dead. Only one counts as working, so we collect two." |
| 0:44 | **Broken equipment to return**: 2 printers, with serials. | "The dead ones are listed separately, to go back to the hub. They aren't netted against the pick list." |
| 0:50 | **Thermal paper minimum: 100 rolls**. | "Paper is counted in rolls. The two-box minimum is a hundred rolls." |
| 0:55 | **To collect: 1 box + 15 rolls, exactly 65 rolls**, with the whole-box alternative. | "V05 has thirty-five, so it needs sixty-five. Whole-box rounding is only shown as a labelled alternative." |
| 1:03 | **V04** selected in the list. | "Now Pavel's van, V04." |
| 1:07 | V04 pick list; **only the card reader line**. | "There's no cable line. His row in the book still had an old cable minimum of twenty, but the third of June minimums replace it." |
| 1:15 | Products Catalog; **Van minimum column**. | "The agreed minimums live in the catalogue." |
| 1:18 | **Ethernet cable 5m: 10 each**. | "Ten cables per van. V04 has twelve, so it isn't short." |
| 1:24 | **Thermal paper 80mm: 100 rolls (2 boxes)**. | "And the paper minimum, a hundred rolls, which is two boxes." |

## What the video can't show

- **Reservations aren't subtracted:** no job is assigned in the imported data, so there are no reservations to show. The video only shows the rule text on the page ("Reserved units still count as in the van").
- **The 3 and 4 van lists, and Pavel's old minimum of 20:** these come from the source material. The app only shows the result (six vans, and a minimum of 10 cables). The import issue that records the ignored minimum (`ROW_MINIMUM_IGNORED`) is available from `GET /api/imports/{id}/issues`, but no screen shows it yet (Imports is marked "Soon").
- **"V04 has twelve":** V04's cable count (12) is on the Inventory page, not on the Products Catalog screen shown at that moment.

## Notes

- Each step is held as a single clean frame from the take. A brief window animation on the display during recording was left out.
- The voiceover was recorded as one take. Each line was cut at its natural pause and placed on its step, with no change to speed or pitch.
