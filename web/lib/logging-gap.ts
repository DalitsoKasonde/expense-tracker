/**
 * How far behind the record is.
 *
 * A backlog grows quietly: nothing in the app changes when a day goes
 * unrecorded, so the first sign is usually a balance that no longer matches,
 * weeks later, when catching up is already daunting. Saying so early, while it
 * is two days and not twenty, is what keeps it small.
 */

/** Below this, a gap is just today and yesterday not being entered yet. */
export const GAP_WORTH_MENTIONING = 2;

function dayNumber(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  // Whole UTC days, so a daylight-saving shift can never make a day 23 hours.
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

/** Days from the newest entry to today, or null when there is nothing to compare. */
export function daysBehind(lastEntryDate: string | null | undefined, today: string): number | null {
  if (!lastEntryDate) return null;
  const last = dayNumber(lastEntryDate);
  const now = dayNumber(today);
  if (last === null || now === null) return null;
  return Math.max(0, now - last);
}

export function gapIsWorthMentioning(days: number | null): days is number {
  return days !== null && days >= GAP_WORTH_MENTIONING;
}

export function describeGap(lastEntryDate: string, days: number) {
  const date = new Date(`${lastEntryDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `Your entries stop at ${date} — ${days} days ago.`;
}
