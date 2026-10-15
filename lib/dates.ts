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

export function todayIsoDate(now = new Date()): string {
  return toIsoDate(now);
}

/** Whole days from `from` to `to` (both calendar days). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
