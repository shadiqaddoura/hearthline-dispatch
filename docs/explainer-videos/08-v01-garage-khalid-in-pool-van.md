# 08 · V01 in the garage, Khalid in the pool van

**Video:** `08-v01-garage-khalid-in-pool-van.mp4` (1:04, no audio)
**README decision:** V01's stock stays where the book says, flagged. Khalid is recorded as driving P1 (from the Read me). V01 jobs after 18 Aug have no stock effect. Inventing the unrecorded move would hide it, so P1 goes negative on three products instead, which is flagged.
**Screen:** Fleet → V01 details → Restocking → P1

Timings are approximate (±1 s).

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Fleet list; pointer on P1, "Khalid Mansour". | "The Read me says Khalid is in the pool van, so P1 is recorded as his." |
| 0:07 | Pointer on V01: "Garage · Unavailable", technician "Unassigned". | "His usual van, V01, has been in the garage since August, with no driver." |
| 0:13 | V01 is clicked; its details open. | "But the book still lists stock in V01." |
| 0:22 | Pointer on "Notes: garage since 18/08/2026". | "Nobody recorded moving that stock to P1, so Hearthline doesn't invent the move." |
| 0:28 | Pointer over "Stock on this van". | "V01's stock stays where the book says it is: cables, paper, printers and terminals. A person has to transfer or correct it." |
| 0:34 | Panel closes; Restocking is opened from the sidebar. | "So what happens to P1?" |
| 0:47 | P1 is clicked; "Count needs review". | "P1 has jobs recorded against it but no stock behind them, so it's flagged: count needs review." |
| 0:53 | Pointer on Ethernet cable: working −4, "Below zero: counted as 0 until reviewed". | "Three products go below zero: cables, card readers and receipt printers. The negative number is kept so the gap is visible." |
| 0:59 | Pointer on card reader: working −2. | "For restocking it's treated as zero until someone reconciles it. The hole in the record stays visible instead of being papered over." |

## What the video can't show

- **V01 jobs after 18 Aug have no stock effect:** this applies to completed jobs from the book, and no screen lists completed jobs yet. The import records it as `VAN_UNAVAILABLE_ON_DATE` issues, available from `GET /api/imports/{id}/issues`.
- The import issues `STOCK_IN_INACTIVE_VAN` and `DRIVER_DETACHED`, which explain the flag, are also only available from the API.
