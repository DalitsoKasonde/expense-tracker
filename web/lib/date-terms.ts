/**
 * Today's calendar date in the device's time zone, as `YYYY-MM-DD`.
 *
 * `toISOString()` is UTC, which in Lusaka (UTC+2) files anything recorded
 * before 02:00 against the previous day. Every default date in a form comes
 * from here for that reason.
 */
export function localDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addYearsToDate(dateValue: string, years: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match || !Number.isInteger(years) || years <= 0) {
    return "";
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const result = new Date(Date.UTC(year + years, monthIndex, day));

  if (result.getUTCMonth() !== monthIndex) {
    result.setUTCDate(0);
  }

  return result.toISOString().slice(0, 10);
}

export function isPastDate(dateValue: string, todayValue: string): boolean {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(dateValue) || !datePattern.test(todayValue)) {
    return false;
  }
  return dateValue < todayValue;
}

/** The local date `days` days before `now`, as `YYYY-MM-DD`. */
export function localDateDaysAgo(days: number, now: Date = new Date()): string {
  const shifted = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return localDate(shifted);
}
