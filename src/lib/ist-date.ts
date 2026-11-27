/** Date helpers for India Standard Time, which is how the company counts a working day. */

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** YYYY-MM-DD of the given instant in IST. */
export function istDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** First and last instant of an IST calendar day. */
export function istDayBounds(date: string): { start: Date; end: Date } {
  return {
    start: new Date(`${date}T00:00:00.000+05:30`),
    end: new Date(`${date}T23:59:59.999+05:30`),
  };
}

export function isDateKey(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** Shift a YYYY-MM-DD date by N days safely in UTC without local timezone jitter. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every YYYY-MM-DD in a YYYY-MM month. */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
