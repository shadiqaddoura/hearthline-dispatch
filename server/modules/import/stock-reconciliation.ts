import type { IssueLog, RowRef } from "./issue-log";

// Turns stock-book counts and job history into current balances, without double-counting.
// Pure: no database access.
//
// 1. Snapshot selection. For each (van, product) only the most recent count is used,
//    chosen by its date, not by its position in the sheet. Older counts are not added in.
//
// 2. Dead units. Pulled-out units sit in the van and get counted with the rest
//    (Field supervisor). They are identified by serial from the Jobs sheet, minus those
//    dropped at the hub. Units that were in the van on the count date are removed from
//    the working figure and held as BROKEN stock.
//
// 3. Later movements. Only events strictly after the count date are applied (the count
//    already reflects earlier ones). Same-day events cannot be ordered against the count,
//    so they are reported and not applied. An event with no count to apply against is
//    reported and not applied.

export interface CountRow {
  ref: RowRef;
  vanCode: string;
  sku: string;
  countedOn: string;
  quantity: number;
}

export interface StockEvent {
  ref: RowRef;
  date: string;
  vanCode: string;
  sku: string;
  /** Change to the van's WORKING stock. */
  delta: number;
  type: "JOB_DELIVERY" | "RESTOCK_COLLECTION";
  label: string;
  customer?: string;
  branch?: string;
}

export interface CollectedBrokenUnit {
  ref: RowRef;
  date: string;
  /** Null when the van it went into cannot be established. */
  vanCode: string | null;
  sku: string;
  serial: string;
  customer: string;
  branch: string;
  label: string;
}

export interface HubDrop {
  ref: RowRef;
  date: string;
  serials: string[];
}

export interface ReconciledStock {
  openingBalances: { vanCode: string; sku: string; quantity: number; countedOn: string; ref: RowRef }[];
  workingMovements: StockEvent[];
  brokenInVans: CollectedBrokenUnit[];
  brokenAtHub: CollectedBrokenUnit[];
  superseded: number;
}

export function reconcileStock(input: {
  counts: CountRow[];
  events: StockEvent[];
  collected: CollectedBrokenUnit[];
  drops: HubDrop[];
  log: IssueLog;
}): ReconciledStock {
  const { log } = input;
  const { snapshots, superseded } = selectSnapshots(input.counts, log);
  const { brokenUnits, droppedOn } = traceBrokenUnits(input.collected, input.drops, log);

  const openingBalances: ReconciledStock["openingBalances"] = [];
  const workingMovements: StockEvent[] = [];
  const applied = new Set<StockEvent>();

  for (const snap of snapshots) {
    const day = snap.countedOn;
    const here = (u: { vanCode: string | null; sku: string }) => u.vanCode === snap.vanCode && u.sku === snap.sku;

    // Dead units physically in the van when it was counted.
    const deadInCount = brokenUnits.filter((u) => {
      const dropped = droppedOn.get(u.serial);
      return here(u) && u.date < day && (!dropped || dropped > day);
    });
    for (const u of brokenUnits.filter((u) => here(u) && u.date === day)) {
      log.info(u.ref, "SAME_DAY_AS_COUNT", `${u.serial} was pulled out on ${day}, the day ${snap.vanCode} was counted; not deducted from the count`);
    }
    const working = snap.quantity - deadInCount.length;
    if (deadInCount.length > 0) {
      log.info(
        snap.ref,
        "DEAD_UNITS_IN_COUNT",
        `${snap.vanCode} ${snap.sku}: the count of ${snap.quantity} includes ${deadInCount.length} dead unit(s) (${deadInCount.map((u) => u.serial).join(", ")}); working stock is ${working}`,
      );
    }
    openingBalances.push({ vanCode: snap.vanCode, sku: snap.sku, quantity: working, countedOn: day, ref: snap.ref });

    let balance = working;
    for (const event of input.events.filter(here)) {
      if (event.date > day) {
        workingMovements.push(event);
        balance += event.delta;
        applied.add(event);
      } else if (event.date === day) {
        log.info(event.ref, "SAME_DAY_AS_COUNT", `${event.label}: on ${day}, the day ${snap.vanCode} ${snap.sku} was counted; cannot tell if the count includes it, not applied`);
        applied.add(event);
      } else {
        applied.add(event); // already reflected in the count
      }
    }
    if (balance < 0) {
      log.warn(
        snap.ref,
        "NEGATIVE_BALANCE",
        `${snap.vanCode} ${snap.sku}: counted ${snap.quantity} on ${day}; after later recorded movements the balance is ${balance}. ` +
          "Preserved for review: a movement is missing from the record (for example a car-park transfer).",
      );
    }
  }

  for (const event of input.events) {
    if (!applied.has(event)) {
      log.warn(event.ref, "NO_COUNT_FOR_EVENT", `${event.label}: ${event.vanCode} has no count for ${event.sku} to apply this to; not applied`);
    }
  }

  return {
    openingBalances,
    workingMovements,
    brokenInVans: brokenUnits.filter((u) => u.vanCode && !droppedOn.has(u.serial)),
    brokenAtHub: brokenUnits.filter((u) => droppedOn.has(u.serial)),
    superseded,
  };
}

/** Latest count per (van, product) by date; ties go to the lower row. */
export function selectSnapshots(counts: CountRow[], log: IssueLog) {
  const groups = new Map<string, CountRow[]>();
  for (const count of counts) {
    const key = `${count.vanCode}|${count.sku}`;
    groups.set(key, [...(groups.get(key) ?? []), count]);
  }

  const snapshots: CountRow[] = [];
  let superseded = 0;
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.countedOn.localeCompare(b.countedOn) || a.ref.rowNumber - b.ref.rowNumber);
    const latest = ordered[ordered.length - 1];
    snapshots.push(latest);
    for (const older of ordered.slice(0, -1)) {
      superseded++;
      if (older.countedOn === latest.countedOn && older.quantity !== latest.quantity) {
        log.warn(older.ref, "SAME_DAY_COUNTS_DIFFER", `${older.vanCode} ${older.sku}: two counts on ${older.countedOn} (${older.quantity} and ${latest.quantity}); row ${latest.ref.rowNumber} used`);
      } else {
        log.info(older.ref, "COUNT_SUPERSEDED", `${older.vanCode} ${older.sku}: count of ${older.quantity} on ${older.countedOn} superseded by ${latest.quantity} on ${latest.countedOn} (row ${latest.ref.rowNumber}); counts are not added together`);
      }
    }
  }
  return { snapshots, superseded };
}

/** Matches dead units pulled out at customers with the serials later dropped at the hub. */
function traceBrokenUnits(collected: CollectedBrokenUnit[], drops: HubDrop[], log: IssueLog) {
  const brokenUnits = [...collected].sort((a, b) => a.date.localeCompare(b.date));
  const collectedOn = new Map<string, CollectedBrokenUnit>();
  for (const unit of brokenUnits) {
    if (collectedOn.has(unit.serial)) {
      log.warn(unit.ref, "SERIAL_COLLECTED_TWICE", `${unit.serial} is recorded as pulled out more than once`);
    }
    collectedOn.set(unit.serial, unit);
    if (!unit.vanCode) {
      log.warn(unit.ref, "BROKEN_UNIT_LOCATION_UNKNOWN", `${unit.label}: dead ${unit.sku} ${unit.serial} went into a van that cannot be established`);
    }
  }

  const droppedOn = new Map<string, string>();
  for (const drop of drops) {
    for (const serial of drop.serials) {
      const unit = collectedOn.get(serial);
      if (!unit) {
        log.warn(drop.ref, "UNKNOWN_DROPPED_SERIAL", `${serial} was dropped at the hub but is not recorded as pulled out of any restaurant`);
      } else if (drop.date < unit.date) {
        log.warn(drop.ref, "DROPPED_BEFORE_COLLECTED", `${serial} dropped at the hub on ${drop.date}, before it was pulled out on ${unit.date}`);
      } else {
        droppedOn.set(serial, drop.date);
      }
    }
  }
  return { brokenUnits, droppedOn };
}
