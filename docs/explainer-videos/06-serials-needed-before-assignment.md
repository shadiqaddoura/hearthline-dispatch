# 06 · Serialised stock without serials needs verification

**Video:** `06-serials-needed-before-assignment.mp4` (2:04, no audio)
**README decision:** Serialised stock without serials is imported as "needs verification" and can't be assigned until a serial is recorded. Right after import, every booked job that needs hardware is blocked with `UNITS_NEED_VERIFICATION` and a list of what to verify. Recording serials unblocks them.
**Screen:** Dispatch → Casa Verde (North Park) → V02 reasons → Inventory V02 receipt printer → verify serial → back to Dispatch

Timings are approximate (±1 s).

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Dispatch board; the request list scrolls down. | "The Casa Verde problem came from units that were counted but never identified. So the import treats any serialised unit without a serial as unverified." |
| 0:08 | Casa Verde, North Park (J-26-26568) is selected. | "This Casa Verde repair needs a receipt printer and a power supply." |
| 0:16 | V02's "Inventory & reasons" is expanded: "Can't take this job · Serials not recorded". | "V02 is in the right zone, but it can't take the job: serials not recorded." |
| 0:24 | Pointer on the receipt printer row: needed 1, available 0, shortfall 1. | "V02 physically has a working printer, but its serial was never recorded, so it counts as unavailable." |
| 0:29 | Pointer on "Shortfall counts assignable stock only; unverified units are physically present but unavailable." | "The page explains it: unverified units are present, just not assignable." |
| 0:34 | Inventory is opened from the sidebar. | "The fix is to record the serial at the next count." |
| 0:47 | Location filter is set to Van V02. | "Here's V02's stock." |
| 0:55 | V02 receipt printer is clicked; its details open. | "The receipt printer has one unit marked 'Needs verification'." |
| 1:03 | A serial is typed into the empty field. | "For this demo I'm entering a test serial, as if I'd read it off the device." |
| 1:10 | The verify button is clicked; the unit shows "Verified" with who and when. | "Verified. The app records who confirmed it and when." |
| 1:26 | Panel closes; pointer on V02's receipt printer row, Available 1. | "Back in the list, the working printer is now available: one, with nothing waiting for a serial." |
| 1:40 | Dispatch is opened; Casa Verde is still selected. | "Now back to Dispatch." |
| 1:48 | Pointer on V02: "Can take this job". | "V02 can now take the job. Nobody overrode a rule: the van has one assignable printer, and the board reflects it." |
| 1:57 | Pointer on the Casa Verde card, which no longer shows "Serials not recorded". | "The request is no longer blocked. It's ready to assign when dispatch decides to." |

## Notes

- The serial typed in the video (`SN-TEST-0001`) is test data. It was saved in the demo database (`hearthline_video`) only.
- Right after verifying, the open details panel still showed Available 0 and Awaiting verification 1 in its stock summary. The table behind it showed the new figures (Available 1) only after the panel was closed. The script avoids the stale summary, but it may be worth checking whether the panel should refresh after a verification.
- The request isn't assigned in this video. Assignment is a separate decision (dispatch stays manual).
