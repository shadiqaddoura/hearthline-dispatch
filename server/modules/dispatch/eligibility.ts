import type { StockShortageDto, VanEligibilityDto, VanProblemCode } from "@/lib/contracts/dispatch";
import type { BlockingReason, VanStatus } from "@/generated/prisma/enums";

// Which vans can take a job, and why the others cannot. Pure: no database access.
//
// A van can take a job when it is ACTIVE, has a driver, and has enough available
// stock (see inventory/availability.ts) for every required item. Matching zones are
// preferred, but a van from another zone is still eligible.

export interface EligibilityJob {
  zone: string | null;
  items: { productId: string; sku: string; quantity: number }[];
}

export interface EligibilityVan {
  vanId: string;
  code: string;
  zone: string | null;
  status: VanStatus;
  technician: { id: string; name: string } | null;
  stock(productId: string): { available: number; needsVerification: number };
}

export function evaluateVan(job: EligibilityJob, van: EligibilityVan): VanEligibilityDto {
  const problems: { code: VanProblemCode; message: string }[] = [];
  if (van.status !== "ACTIVE") problems.push({ code: "VAN_NOT_ACTIVE", message: `${van.code} is ${van.status.toLowerCase()}` });
  if (!van.technician) problems.push({ code: "NO_TECHNICIAN", message: `${van.code} has no driver` });

  const shortages: StockShortageDto[] = [];
  for (const item of job.items) {
    const { available, needsVerification } = van.stock(item.productId);
    if (available < item.quantity) {
      shortages.push({ productId: item.productId, sku: item.sku, required: item.quantity, available, needsVerification });
    }
  }
  if (shortages.length > 0) {
    const verificationWouldCover = shortages.every((s) => s.available + s.needsVerification >= s.required);
    problems.push(
      verificationWouldCover
        ? { code: "UNITS_NEED_VERIFICATION", message: `${van.code} has the units but ${describe(shortages, "unverified")}` }
        : { code: "INSUFFICIENT_STOCK", message: `${van.code} is short: ${describe(shortages, "short")}` },
    );
  }

  return {
    vanId: van.vanId,
    code: van.code,
    zone: van.zone,
    zoneMatch: sameZone(job.zone, van.zone),
    technician: van.technician,
    eligible: problems.length === 0,
    problems,
    shortages,
  };
}

/** Eligible vans first, then vans in the job's zone, then by van code. */
export function rankVans(results: VanEligibilityDto[]): VanEligibilityDto[] {
  return [...results].sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      Number(b.zoneMatch) - Number(a.zoneMatch) ||
      a.code.localeCompare(b.code),
  );
}

/** The blocking reason for an open request, or null when some van can take it. */
export function decideBlocking(results: VanEligibilityDto[]): { reason: BlockingReason; detail: string } | null {
  if (results.some((r) => r.eligible)) return null;

  const verifiable = results.filter((r) => r.problems.length === 1 && r.problems[0].code === "UNITS_NEED_VERIFICATION");
  if (verifiable.length > 0) {
    return {
      reason: "UNITS_NEED_VERIFICATION",
      detail: `Record serials to unblock: ${verifiable.map((r) => r.problems[0].message).join("; ")}`,
    };
  }
  const driven = results.filter((r) => !r.problems.some((p) => p.code === "VAN_NOT_ACTIVE" || p.code === "NO_TECHNICIAN"));
  return {
    reason: "NO_ELIGIBLE_VAN",
    detail:
      driven.length === 0
        ? "No active van has a driver"
        : `No active van has every item: ${driven.map((r) => r.problems.map((p) => p.message).join(", ")).join("; ")}`,
  };
}

function sameZone(a: string | null, b: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function describe(shortages: StockShortageDto[], mode: "unverified" | "short") {
  return shortages
    .map((s) =>
      mode === "unverified"
        ? `${s.required - s.available} ${s.sku} need serial verification`
        : `${s.sku} ${s.available}/${s.required}`,
    )
    .join(", ");
}
