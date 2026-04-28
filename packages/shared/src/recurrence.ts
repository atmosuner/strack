/**
 * Recurrence expansion for lessons.
 *
 * All dates are in UTC. DST is not handled — lessons are stored and expanded
 * as UTC timestamps. This is documented as a known limitation; a future
 * version can add IANA timezone support.
 */

export type RecurrenceRule = {
  freq: "weekly";
  interval: number;
  /** ISO date string (YYYY-MM-DD) — series stops after this date (inclusive). */
  until?: string;
  /** Maximum number of occurrences (including the first). */
  count?: number;
};

export type Occurrence = {
  /** The original occurrence date (UTC midnight of the day the lesson starts). */
  date: string;
  startAt: string;
  endAt: string;
};

const MS_PER_DAY = 86_400_000;

export function parseRecurrenceRule(json: string): RecurrenceRule | null {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    if (obj.freq !== "weekly") return null;
    const interval = typeof obj.interval === "number" ? obj.interval : 1;
    const rule: RecurrenceRule = { freq: "weekly", interval: Math.max(1, interval) };
    if (typeof obj.until === "string") rule.until = obj.until;
    if (typeof obj.count === "number" && obj.count > 0) rule.count = obj.count;
    return rule;
  } catch {
    return null;
  }
}

export function stringifyRecurrenceRule(rule: RecurrenceRule): string {
  return JSON.stringify(rule);
}

/**
 * Expand a recurring lesson into individual occurrence slots within
 * [rangeStart, rangeEnd].
 *
 * @param seriesStartAt  ISO datetime of the first occurrence start
 * @param seriesEndAt    ISO datetime of the first occurrence end
 * @param rule           Parsed recurrence rule
 * @param rangeStart     ISO datetime — start of query window
 * @param rangeEnd       ISO datetime — end of query window
 * @param exceptionDates Set of ISO date strings (YYYY-MM-DD) that are overridden
 *                       or cancelled — these dates are excluded from output
 */
export function expandOccurrencesInRange(
  seriesStartAt: string,
  seriesEndAt: string,
  rule: RecurrenceRule,
  rangeStart: string,
  rangeEnd: string,
  exceptionDates: Set<string> = new Set()
): Occurrence[] {
  const start = new Date(seriesStartAt);
  const end = new Date(seriesEndAt);
  const durationMs = end.getTime() - start.getTime();

  const rStart = new Date(rangeStart).getTime();
  const rEnd = new Date(rangeEnd).getTime();

  const untilMs = rule.until
    ? new Date(rule.until + "T23:59:59.999Z").getTime()
    : Infinity;
  const maxCount = rule.count ?? Infinity;
  const stepDays = rule.interval * 7;

  const results: Occurrence[] = [];
  let cursor = start.getTime();
  let count = 0;

  while (cursor <= rEnd && cursor <= untilMs && count < maxCount) {
    const occEnd = cursor + durationMs;

    if (occEnd >= rStart) {
      const dateKey = new Date(cursor).toISOString().slice(0, 10);
      if (!exceptionDates.has(dateKey)) {
        results.push({
          date: dateKey,
          startAt: new Date(cursor).toISOString(),
          endAt: new Date(occEnd).toISOString(),
        });
      }
    }

    cursor += stepDays * MS_PER_DAY;
    count++;
  }

  return results;
}
