# 00 · Introduction

**Video:** `00-introduction.mp4` (1:19, with voiceover from `00-introduction.mp3`)
**Purpose:** who built Hearthline Dispatch, what problem it solves, how it's built, and what the 12 decision videos cover.
**Screen:** title card → "One shared stock book" card → Dispatch → "How it's built" card (Next.js, PostgreSQL and Fluent UI logos) → Dispatch, Restocking, Inventory, Products → "12 decisions" card

Same format as the decision videos: white cards and still app screens, a teal box around the area each phrase talks about, and no mouse pointer. Times below are where each phrase starts in the finished video.

| Time | On screen (highlighted area) | Say |
| --- | --- | --- |
| 0:01 | Title card: Hearthline Dispatch, built by Shadi Qaddoura. | "Hi, I'm Shadi, and this is Hearthline Dispatch, the van stock and dispatch system I built for a team of field technicians." |
| 0:11 | "Where it started" card; **One shared stock book**. | "The team ran everything from one shared stock book." |
| 0:14 | **1 · Counts were repeated**. | "Counts were repeated," |
| 0:16 | **2 · Dead units… 3 · Serial numbers were missing**. | "dead units were counted as working, and serial numbers were missing." |
| 0:20 | **4 · People disagreed…** | "People disagreed on basic questions, like whose stock it is, the van's or the technician's." |
| 0:27 | Dispatch board; **the two requests marked "Import needs review"**. | "Hearthline imports that book and keeps every row it couldn't settle, flagged for review. It doesn't guess." |
| 0:34 | "How it's built" card; **Next.js and PostgreSQL logos row**. | "It's one Next.js application with a PostgreSQL database." |
| 0:39 | **One ledger row**. | "Every stock change goes through a single ledger and is recorded." |
| 0:43 | **Fluent UI logo row**. | "The screens are built with Microsoft's Fluent 2 design system." |
| 0:47 | Dispatch with Mezze House selected; **the request and its van choices**. | "You'll see Dispatch, where requests are matched to vans that can actually do the job." |
| 0:52 | Restocking, V05 selected; **the pick list**. | "Restocking shows each van's pick list." |
| 0:55 | Inventory, V03 cable details; **Add stock · Correct count · Transfer stock**. | "Inventory covers receiving, corrections, serial checks and transfers." |
| 1:01 | Products Catalog; **Van minimum and Auto restock columns**. | "And Products holds the catalogue and minimums." |
| 1:04 | "12 decisions" card; **the heading**. | "The material didn't always agree, so I had to make decisions." |
| 1:09 | **The list of 12 decisions**. | "The next twelve short videos each take one of those decisions and show how the app handles it, using the real imported data." |
| 1:16 | **01 · Stock belongs to the van**. | "Let's start." |

## Notes

- Logos: Next.js from `public/next.svg`, the PostgreSQL elephant from simple-icons (CC0) and the Fluent UI logo from Microsoft's fluentui repository. They appear only on the "How it's built" card.
- App screens were recorded on the demo database (`hearthline_video`) after video 02, so V03 shows 20 cables and its history includes the car-park transfer.
