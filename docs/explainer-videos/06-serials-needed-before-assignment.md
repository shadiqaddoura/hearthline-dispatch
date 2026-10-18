# 06 · Serialised stock without serials needs verification

**Video:** `06-serials-needed-before-assignment.mp4` (1:16, with voiceover from `06-serials-needed-before-assignment.mp3`)
**README decision:** Serialised stock without serials is imported as "needs verification" and can't be assigned until a serial is recorded. Right after import, every booked job that needs hardware is blocked with `UNITS_NEED_VERIFICATION` and a list of what to verify. Recording serials unblocks them.
**Screen:** intro card → Dispatch, Casa Verde (North Park) → V02 reasons → Inventory, V02 → receipt printer details → verify serial → back to Dispatch

The video opens on a white card that states the issue and the decision. After that, each step is a still screen with a teal box around the area the line talks about. No mouse pointer is shown. Times below are where each line starts in the finished video.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Intro card: the issue and the decision. | "The Casa Verde problem came from units that were counted but never identified. So the import treats any serialised unit without a serial as unverified." |
| 0:13 | Casa Verde, North Park (J-26-26568) selected; **Required products: receipt printer and power supply**. | "This Casa Verde repair needs a receipt printer and a power supply." |
| 0:17 | **V02: "Can't take this job · Serials not recorded"**. | "V02 is in the right zone, but it can't take the job: serials not recorded." |
| 0:23 | V02's reasons expanded; **Receipt printer 80mm: needed 1, available 0, shortfall 1**. | "V02 physically has a working printer, but its serial was never recorded, so it counts as unavailable." |
| 0:30 | **"Shortfall counts assignable stock only; unverified units are physically present but unavailable."** | "The page explains it: unverified units are present, just not assignable." |
| 0:36 | Inventory filtered to Van V02; **the Awaiting serial verification column**. | "The fix is to record the serial at the next count." |
| 0:39 | **V02's stock table**. | "Here's V02's stock." |
| 0:41 | V02 receipt printer details; **the unit marked "Needs verification"**. | "The receipt printer has one unit marked 'Needs verification'." |
| 0:45 | **The serial field with the test serial SN-TEST-0001**. | "For this demo I'm entering a test serial, as if I'd read it off the device." |
| 0:50 | **SN-TEST-0001: Verified, recorded by Demo Operations, with the date and time**. | "Verified. The app records who confirmed it and when." |
| 0:54 | Panel closed; **V02 Receipt printer 80mm: available 1, awaiting 0**. | "Back in the list, the working printer is now available: one, with nothing waiting for a serial." |
| 1:00 | Dispatch, Casa Verde still selected; **the Casa Verde card**. | "Now back to Dispatch." |
| 1:02 | **V02 "Can take this job"** and **Receipt printer 80mm: available 1, shortfall 0**. | "V02 can now take the job. Nobody overrode a rule: the van has one assignable printer, and the board reflects it." |
| 1:10 | **"1 van can take this job"** and **the Casa Verde card, no longer marked "Serials not recorded"**. | "The request is no longer blocked. It's ready to assign when dispatch decides to." |

## What the video can't show

- **Every booked job blocked after import:** the board shows many other requests marked "Serials not recorded", but the video only walks through Casa Verde and one van (V02). The other vans' units awaiting a serial are in Inventory's "Awaiting serial verification" column, which the video only shows for V02.

## Notes

- The serial in the video (`SN-TEST-0001`) is test data. It was saved in the demo database (`hearthline_video`) only.
- Right after verifying, the open details panel still showed Available 0 and Awaiting verification 1 in its stock summary. The table behind it showed the new figures (Available 1) only after the panel was closed. The video avoids the stale summary, but it may be worth checking whether the panel should refresh after a verification.
- The request isn't assigned in this video. Assignment is a separate decision (dispatch stays manual).
- Each step is held as a single clean frame from the take, and no pointer is in frame. After verifying, the equipment table had scrolled sideways; it was scrolled back so the serial is readable.
- The voiceover was recorded as one take. Each line was cut at its natural pause and placed on its step, with no change to speed or pitch.
