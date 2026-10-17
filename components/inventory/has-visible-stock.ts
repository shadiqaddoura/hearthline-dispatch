import type { StockLineDto } from "@/lib/contracts/inventory";

/** Hide empty display rows, retaining negative counts that need a recount. */
export function hasVisibleStock(line: StockLineDto): boolean {
  return [line.working, line.reserved, line.available, line.broken, line.needsVerification ?? 0]
    .some((quantity) => quantity !== 0);
}
