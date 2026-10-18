# 02 · Car-park swaps are recorded as transfers

**Video:** `02-car-park-swaps-recorded-as-transfers.mp4` (2:15, no audio)
**README decision:** Car-park swaps are allowed and recorded as one movement naming both vans. Forbidding them didn't stop them. It produced V03's −2 terminals.
**Screen:** Inventory → filter Van V03 → Ethernet cable → Transfer stock → V03 and V05 movement history

Timings are approximate (±1 s).

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Inventory, scrolling down to the stock table. | "Technicians swap parts between vans in the car park. The question was whether to forbid that." |
| 0:08 | Location filter changes to Van V03; V03's stock is listed. | "Here's van V03." |
| 0:18 | Pointer on POS terminal: "−2 · Reconcile", with its tooltip. | "Minus two terminals. That's what forbidding swaps produced: they still happened, they just weren't written down. The app keeps the negative count and asks for a reconcile." |
| 0:25 | Ethernet cable row is clicked; its details open. | "So Hearthline allows swaps and records them. I'll hand two cables from V03 to V05." |
| 0:32 | Transfer stock form opens. | "Transfer stock." |
| 0:38 | Pointer on "From: Van V03". | "It's coming from V03…" |
| 0:43 | "To location" is set to Van V05. | "…going to V05." |
| 0:50 | Quantity is set to 2. | "Two cables." |
| 0:56 | Reason is typed: "Car-park swap: 2 cables handed from V03 to V05". | "I'll add a reason so anyone reading the history knows what happened." |
| 1:04 | Transfer is submitted; V03's cables drop from 22 to 20. | "Saved. V03 now shows twenty cables instead of twenty-two." |
| 1:13 | V03 cable details reopen and the movement history is visible. | "Here's V03's history…" |
| 1:22 | Pointer on the TRANSFER row, then on its reason. | "…one transfer of two cables, with the reason, the time and who recorded it." |
| 1:33 | Panel closes; the location filter changes to Van V05. | "Now the other van." |
| 1:51 | Pointer on V05's Ethernet cable row: 16. | "V05 went from fourteen to sixteen." |
| 1:56 | V05 cable details open on the same TRANSFER row. | "And V05's history shows the same transfer at the same moment. It's one recorded movement with both vans on it, not two separate edits." |
| 2:09 | Pointer on V05 working stock: 16. | "Nothing is lost, and the counts on both vans still add up." |

## Notes

- The movement history doesn't have From and To columns. The video shows that both vans are named by the same transfer appearing in both vans' histories, and by the reason typed in the form.
- This transfer changed the demo database (`hearthline_video`): V03 has 20 cables and V05 has 16.
