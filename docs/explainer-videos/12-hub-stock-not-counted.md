# 12 · Hub stock isn't counted

**Video:** `12-hub-stock-not-counted.mp4` (1:02, with voiceover from `12-hub-stock-not-counted.mp3`)
**README decision:** Hub stock isn't counted. The hub is a location that movements can name. There are no hub counts to start from.
**Screen:** intro card → Inventory: Hub "Awaiting physical opening count" → Location filter: Hub (no balance) → Create warehouse (opening physical count) → Hub "Stock tracked" → Location filter: Hub (balances)

The video opens on a white card that states the issue and the decision. After that, each step is a still screen with a teal box around the area the line talks about. No mouse pointer is shown. Times below are where each line starts in the finished video.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Intro card: the issue and the decision. | "The stock book only counts vans. There's no count for the hub's shelves." |
| 0:09 | Inventory; **Hub · Warehouse · Awaiting physical opening count**. | "So the hub exists as a location, but it's labelled as awaiting a physical opening count." |
| 0:16 | **Location: Hub · warehouse**. | "If I filter to the hub, there's no balance at all." |
| 0:19 | **"No matching inventory."** | "The app doesn't make up a number for the hub." |
| 0:21 | **Create warehouse** button. | "The fix is a real count." |
| 0:24 | Create warehouse form; **its title**. | "Someone counts the shelves, then records it here, with Create warehouse." |
| 0:28 | **Opening physical count: "This setup keeps the existing warehouse and its movement history. Enter today's counts…"** | "It keeps the existing hub and its history, and asks for today's counts." |
| 0:33 | **Broken quantities: card reader 4, receipt printer 5, kitchen printer 1, 4G router 3**. | "The hub already holds 13 broken devices returned from vans." |
| 0:38 | **The broken quantities**. | "The count has to include them." |
| 0:40 | **Working quantities: 6, 8, 3 and 4**. | "For this demo, I enter sample working counts, alongside those broken devices." |
| 0:45 | **Opening count reason or reference: "Opening shelf count at the hub, 18 Oct (demo values)"**. | "A reason is required, as with every count." |
| 0:48 | **Hub · Stock tracked** and **"Warehouse configured. Use its stock details for corrections, transfers and serial verification."** | "Now the hub is stock tracked." |
| 0:50 | Location: Hub; **4G router, card reader, kitchen printer and receipt printer rows: working and broken**. | "Filtering to the hub shows real balances, working and broken." |
| 0:55 | **The hub's stock table**. | "From now on, corrections, transfers and serial checks work on the hub, like on any van." |

## What the video can't show

- **Where the working counts come from:** there's no real shelf count in the material, so the working numbers in the video are sample values entered for the demo. The broken numbers match the devices the import already recorded as returned to the hub.

## Notes

- **The opening count is demo data:** it was recorded in the demo database (`hearthline_video`) only. The hub already held 13 broken devices with serials, returned from vans: 5 receipt printers (PRN-80), 4 card readers (PAY-A9), 3 4G routers (RTR-4G) and 1 kitchen printer (PRN-K). The form refuses a count below those, so their broken quantities were entered as 5, 4, 3 and 1. The working counts (8, 6, 4 and 3) are sample values.
- Working units of serialised products entered without serials arrive as "needs verification", like the vans' imported units (see video 06). That's why the hub's table shows them under "Awaiting serial verification", with Available 0.
- Create warehouse can only be used once. After that, the hub's count is changed with Correct count, like a van's.
- Each step is held as a single clean frame from the take, and no pointer is in frame.
- The voiceover was recorded as one take, transcribed locally to find where each line starts, and cut at its natural pauses with no change to speed or pitch.
