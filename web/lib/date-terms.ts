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
