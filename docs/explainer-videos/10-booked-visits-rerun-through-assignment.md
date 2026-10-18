# 10 · Booked visits go through normal assignment

**Video:** `10-booked-visits-rerun-through-assignment.mp4` (1:15, with voiceover from `10-booked-visits-rerun-through-assignment.mp3`)
**README decision:** Booked visits are re-run through normal assignment after import. A booking only becomes an assignment if the van can actually do it.
**Screen:** intro card → Dispatch → Saffron & Co (Harbour) → Recorded details → V05 reasons → Inventory, V05 → Add stock (2 receipt printers with serials) → Dispatch → Assign to a van → Confirm → Saffron & Co assigned

The video opens on a white card that states the issue and the decision. After that, each step is a still screen with a teal box around the area the line talks about. No mouse pointer is shown. Times below are where each line starts in the finished video.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Intro card: the issue and the decision. | "The stock book had visits already booked onto vans. None of them came in as assignments. Every one is waiting." |
| 0:12 | **Saffron & Co, Harbour (J-26-26561)** selected, and its title. | "Take Saffron & Co. The book had it booked on V05, for the fifteenth of October." |
| 0:18 | Recorded details; **Planned day Thu 15 Oct 2026** and **Imported status "Scheduled"**. | "The planned day is kept, and the book's status, Scheduled, is shown as written." |
| 0:23 | **V05, first in the van choices**. | "But a booking only becomes an assignment if the van can really do the job." |
| 0:27 | **"Can't take this job · Not enough equipment"**. | "V05 can't." |
| 0:29 | V05 reasons; **Receipt printer 80mm: needed 2, available 0, shortfall 2**. | "It needs two receipt printers, and V05 has none available." |
| 0:34 | **"No van can take this job right now"**. | "So the fix is to make the van able to do the job, not to force the booking through." |
| 0:40 | Inventory, Van V05; **Receipt printer 80mm: available 0**. | "The technician collects two printers from the hub." |
| 0:43 | Add stock form; **Receive at: Van V05** and **Quantity: 2**. | "In Inventory, I add them to V05, with their serials." |
| 0:47 | **Serial numbers: SN-TEST-0002, SN-TEST-0003**. | "For this demo, the serials are test values." |
| 0:50 | V05 receipt printer details; **SN-TEST-0002 and SN-TEST-0003: Verified, Working**. | "V05 now has two working printers, both verified." |
| 0:55 | Dispatch, Saffron & Co; **V05 "Can take this job"** and **Receipt printer: needed 2, available 2, shortfall 0**. | "Back in Dispatch, V05 can take the job." |
| 0:58 | Assign J-26-26561; **V05 · Dan Whitfield** chosen. | "I assign it." |
| 0:59 | **Scheduled day: 19/10/2026**. | "The fifteenth has passed, so I pick a new day." |
| 1:02 | Confirm assigning J-26-26561; **Van V05**, **Scheduled day Mon 19 Oct 2026**, **Equipment reserved: 2 × PRN-80, 1 × PSU-24**. | "The review shows the van, the day, and the equipment that will be reserved." |
| 1:07 | **"J-26-26561 is assigned. On V05 with Dan Whitfield. Scheduled Mon 19 Oct 2026. Reserved: 2 × PRN-80, 1 × PSU-24."** | "Confirmed." |
| 1:08 | **"15 waiting · 1 assigned / in progress"** and **Assigned or in progress (1): Saffron & Co, V05, Mon 19 Oct 2026**. | "Saffron & Co moves to assigned, and V05's two printers are reserved for it." |

## What the video can't show

- **Every booked visit at once:** the import re-ran all of them; the video follows one (Saffron & Co). The others are the waiting requests on the board, each with its own reason.

## Notes

- **The fix is demo data:** two receipt printers with test serials (`SN-TEST-0002`, `SN-TEST-0003`) were added to V05 with the reason "Collected from the hub for Saffron & Co (demo)", and Saffron & Co was assigned to V05 for Mon 19 Oct 2026, in the demo database (`hearthline_video`) only.
- The book's planned day (15 October) is before today in the demo (18 October), and the Assign dialog doesn't accept a past day, so a new day was chosen.
- Adding stock with serials records the units as verified. Without serials they would arrive as "needs verification" and V05 still couldn't take the job (see video 06).
- Each step is held as a single clean frame from the take. The mouse pointer was resting on the recorded display during this take; it was painted out of each still from the surrounding background, so no pointer is in frame.
- The voiceover was recorded as one take, transcribed locally to find where each line starts, and cut at its natural pauses with no change to speed or pitch.
