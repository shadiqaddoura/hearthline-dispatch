// Calendar days are stored as Postgres DATE values, which Prisma reads as UTC midnight.

export function fromIsoDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toIsoDateOrNull(date: Date | null | undefined): string | null {
  return date ? toIsoDate(date) : null;
}

/** Hearthline operates in the UK: "today" is the London calendar day, wherever the server runs. */
export const BUSINESS_TIME_ZONE = "Europe/London";

export function todayIsoDate(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(now);
}

/** Whole days from `from` to `to` (both calendar days). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
