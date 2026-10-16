// Test fixtures only: invented customers and vans shaped like API responses.
// Never imported by application code.
import type { DispatchBoardDto, VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { StockLineDto } from "@/lib/contracts/inventory";
import type { JobDto } from "@/lib/contracts/jobs";

const PRINTER = { productId: "prd-printer", sku: "TEST-PRN", name: "Test printer" };
const CABLE = { productId: "prd-cable", sku: "TEST-CBL", name: "Test cable" };

export function testJob(overrides: Partial<JobDto> & Pick<JobDto, "id" | "reference">): JobDto {
  return {
    type: "INSTALLATION",
    status: "REQUESTED",
    blockingReason: null,
    blockingDetail: null,
    sourceStatus: null,
    customer: { id: "cus-1", name: "Test Bistro" },
    branch: { id: "br-1", name: "Test Street", zone: "North" },
    requestedOn: "2026-10-02",
    waitingDays: 14,
    scheduledFor: null,
    sequence: null,
    van: null,
    technician: null,
    items: [{ ...PRINTER, quantity: 1 }],
    activeReservations: [],
    completedOn: null,
    notes: null,
    ...overrides,
  };
}

function line(product: typeof PRINTER, figures: Partial<StockLineDto>): StockLineDto {
  return {
    ...product,
    baseUnit: "each",
    serialised: product === PRINTER,
    working: 0,
    broken: 0,
    reserved: 0,
    verifiedWorking: product === PRINTER ? 0 : null,
    needsVerification: product === PRINTER ? 0 : null,
    available: 0,
    vanMinimum: 1,
    ...figures,
  };
}

function van(
  id: string,
  code: string,
  zone: string | null,
  options: { status?: "ACTIVE" | "GARAGE"; technician?: string | null; lines?: StockLineDto[]; assignedJobs?: JobDto[] } = {},
): DispatchBoardDto["vans"][number] {
  const technician = options.technician === undefined ? `Driver of ${code}` : options.technician;
  return {
    van: {
      id,
      code,
      plate: `TEST ${code}`,
      zone,
      status: options.status ?? "ACTIVE",
      statusNote: null,
      isPool: false,
      locationId: `loc-${id}`,
      technician: technician ? { id: `tech-${id}`, name: technician } : null,
    },
    stock: { locationId: `loc-${id}`, locationName: code, vanId: id, lines: options.lines ?? [] },
    jobsToday: [],
    assignedJobs: options.assignedJobs ?? [],
  };
}

export const waitingJob = testJob({ id: "job-wait", reference: "T-WAIT", customer: { id: "c1", name: "Harbour Cafe" } });
export const undatedJob = testJob({
  id: "job-undated",
  reference: "T-UNDATED",
  customer: { id: "c2", name: "Lantern Diner" },
  requestedOn: null,
  waitingDays: null,
  items: [{ ...PRINTER, quantity: 2 }],
  blockingReason: "IMPORT_NEEDS_REVIEW",
  blockingDetail: "Imported row had no request date.",
});
export const assignedJob = testJob({
  id: "job-assigned",
  reference: "T-ASSIGNED",
  customer: { id: "c3", name: "Olive Room" },
  status: "ASSIGNED",
  requestedOn: "2026-10-10",
  waitingDays: 6,
  scheduledFor: "2026-10-18",
  sequence: 1,
  van: { id: "van-north", code: "T-N" },
  technician: { id: "tech-van-north", name: "Driver of T-N" },
});

export const testBoard: DispatchBoardDto = {
  date: "2026-10-16",
  openRequests: [waitingJob, undatedJob],
  assignedWork: [assignedJob],
  vans: [
    van("van-garage", "T-G", "North", {
      status: "GARAGE",
      technician: null,
      lines: [line(PRINTER, { working: 3, verifiedWorking: 3, available: 3 })],
    }),
    van("van-north", "T-N", "North", {
      lines: [
        line(PRINTER, { working: 3, broken: 1, reserved: 1, verifiedWorking: 2, needsVerification: 1, available: 1 }),
        line(CABLE, { working: 10, available: 10 }),
      ],
      assignedJobs: [assignedJob],
    }),
    van("van-south", "T-S", "South", { lines: [line(PRINTER, { working: 2, verifiedWorking: 2, available: 2 })] }),
  ],
};

/** What the backend would say for `waitingJob`: T-N (same zone) and T-S can take it; T-G can't. */
export const waitingJobEligibility: VanEligibilityDto[] = [
  { vanId: "van-north", code: "T-N", zone: "North", zoneMatch: true, technician: { id: "t1", name: "Driver of T-N" }, eligible: true, problems: [], shortages: [] },
  { vanId: "van-south", code: "T-S", zone: "South", zoneMatch: false, technician: { id: "t2", name: "Driver of T-S" }, eligible: true, problems: [], shortages: [] },
  {
    vanId: "van-garage",
    code: "T-G",
    zone: "North",
    zoneMatch: true,
    technician: null,
    eligible: false,
    problems: [
      { code: "VAN_NOT_ACTIVE", message: "T-G is garage" },
      { code: "NO_TECHNICIAN", message: "T-G has no driver" },
    ],
    shortages: [],
  },
];

/** No van can take `undatedJob`: one is short, one has units waiting for serials. */
export const undatedJobEligibility: VanEligibilityDto[] = [
  {
    vanId: "van-north",
    code: "T-N",
    zone: "North",
    zoneMatch: true,
    technician: { id: "t1", name: "Driver of T-N" },
    eligible: false,
    problems: [{ code: "UNITS_NEED_VERIFICATION", message: "T-N has the units but 1 TEST-PRN need serial verification" }],
    shortages: [{ productId: PRINTER.productId, sku: PRINTER.sku, required: 2, available: 1, needsVerification: 1 }],
  },
  {
    vanId: "van-south",
    code: "T-S",
    zone: "South",
    zoneMatch: false,
    technician: { id: "t2", name: "Driver of T-S" },
    eligible: false,
    problems: [{ code: "INSUFFICIENT_STOCK", message: "T-S is short: TEST-PRN 0/2" }],
    shortages: [{ productId: PRINTER.productId, sku: PRINTER.sku, required: 2, available: 0, needsVerification: 0 }],
  },
];
