// How much of a product a location can still commit to a new job.
//
//   available = assignable working stock − active reservations
//
// where "assignable" is the physical WORKING count, except for serialised products,
// where only units with a recorded serial (VERIFIED) count. Broken stock is a
// separate balance and is never included. Reservations never change the balance.

export interface StockFigures {
  working: number;
  broken: number;
  reserved: number;
  /** Serialised products: WORKING units in stock here with a verified serial. */
  verifiedWorking: number;
}

export function assignableQuantity(serialised: boolean, figures: StockFigures): number {
  const assignable = serialised ? Math.min(figures.verifiedWorking, figures.working) : figures.working;
  return Math.max(0, assignable);
}

export function availableQuantity(serialised: boolean, figures: StockFigures): number {
  return Math.max(0, assignableQuantity(serialised, figures) - figures.reserved);
}

/** Serialised products: units counted but not assignable until a serial is recorded. */
export function needsVerificationQuantity(serialised: boolean, figures: StockFigures): number | null {
  if (!serialised) return null;
  return Math.max(0, figures.working - figures.verifiedWorking);
}
