# 08 · V01 in the garage, Khalid in the pool van

**Video:** `08-v01-garage-khalid-in-pool-van.mp4` (1:03, with voiceover from `08-v01-garage-khalid-in-pool-van.mp3`)
**README decision:** V01's stock stays where the book says, flagged. Khalid is recorded as driving P1 (from the Read me). V01 jobs after 18 Aug have no stock effect. Inventing the unrecorded move would hide it, so P1 goes negative on three products instead, which is flagged.
**Screen:** intro card → Fleet → V01 details → Restocking → P1

The video opens on a white card that states the issue and the decision. After that, each step is a still screen with a teal box around the area the line talks about. No mouse pointer is shown. Times below are where each line starts in the finished video.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Intro card: the issue and the decision. | "The Read me says Khalid is in the pool van, so P1 is recorded as his." |
| 0:10 | Fleet; **V01: technician Unassigned, Garage · Unavailable**. | "His usual van, V01, has been in the garage since August, with no driver." |
| 0:16 | V01 details; **Stock on this van**. | "But the book still lists stock in V01." |
| 0:20 | **Technician: Unassigned · Status: GARAGE · Notes: garage since 18/08/2026**. | "Nobody recorded moving that stock to P1, so Hearthline doesn't invent the move." |
| 0:26 | **Stock on this van**. | "V01's stock stays where the book says it is," |
| 0:29 | **Ethernet cable, thermal paper, POS terminal and receipt printer rows**. | "cables, paper, printers and terminals." |
| 0:32 | **Stock on this van**. | "A person has to transfer or correct it." |
| 0:35 | Restocking; **P1 (Khalid Mansour): Count needs review**. | "So what happens to P1?" |
| 0:38 | P1 restock; **working in van: −4, −2, −2**. | "P1 has jobs recorded against it, but no stock behind them," |
| 0:42 | **Count needs review** on P1's card. | "so it's flagged." |
| 0:43 | **Count needs review**. | "Count needs review." |
| 0:44 | **Working in van: −4, −2, −2**. | "Three products go below zero," |
| 0:47 | **Ethernet cable 5m, Card reader and Receipt printer 80mm rows**. | "cables, card readers and receipt printers." |
| 0:50 | **Ethernet cable: −4, "Below zero: counted as 0 until reviewed"**. | "The negative number is kept so the gap is visible." |
| 0:54 | **Ethernet cable row: minimum 10, to collect 10**. | "For restocking, it's treated as zero until someone reconciles it." |
| 0:58 | **The three below-zero rows**. | "The hole in the record stays visible instead of being papered over." |

## What the video can't show

- **V01 jobs after 18 Aug have no stock effect:** this applies to completed jobs from the book, and no screen lists completed jobs yet. The import records it as `VAN_UNAVAILABLE_ON_DATE` issues, available from `GET /api/imports/{id}/issues`.
- The import issues `STOCK_IN_INACTIVE_VAN` and `DRIVER_DETACHED`, which explain the flag, are also only available from the API.
- **"A person has to transfer or correct it":** the V01 details panel has no Transfer or Correct count action. Those actions are on the Inventory page (video 02 shows a transfer, video 07 a correction).

## Notes

- Each step is held as a single clean frame from the take, and no pointer is in frame.
- The voiceover was recorded as one take, transcribed locally to find where each line starts, and cut at its natural pauses with no change to speed or pitch.
