export type ReportMonthSnapshot = {
  month: number;
  monthLabel: string;
  totalInflow: number;
  livingExpenses: number;
  debtPrincipalPaid: number;
  debtInterestFees: number;
  savings: number;
  investments: number;
  freeCashFlow: number;
};

export type TrendPoint = {
  x: number;
  y: number;
};

export function cashCommitments(month: ReportMonthSnapshot) {
  return month.livingExpenses + month.debtPrincipalPaid + month.debtInterestFees;
}
export function wealthAllocation(month: ReportMonthSnapshot) {
  return month.savings + month.investments;
}

export function hasReportMovement(month: ReportMonthSnapshot) {
  return [
    month.totalInflow,
    month.livingExpenses,
    month.debtPrincipalPaid,
    month.debtInterestFees,
    month.savings,
    month.investments,
  ].some((value) => value !== 0);
}

export function analyzeReportMonths(months: ReportMonthSnapshot[]) {
  const activeMonths = months.filter(hasReportMovement);
  const strongestMonth = activeMonths.reduce<ReportMonthSnapshot | null>(
    (best, month) => (!best || month.freeCashFlow > best.freeCashFlow ? month : best),
    null,
  );
  const highestCommitmentMonth = activeMonths.reduce<ReportMonthSnapshot | null>(
    (highest, month) =>
      !highest || cashCommitments(month) > cashCommitments(highest) ? month : highest,
    null,
  );
  const averageFreeCashFlow = activeMonths.length
    ? Math.round(
        activeMonths.reduce((total, month) => total + month.freeCashFlow, 0) /
          activeMonths.length,
      )
    : 0;
  const chartMaximum = Math.max(
    1,
    ...months.flatMap((month) => [
      Math.max(0, month.totalInflow),
      Math.max(0, cashCommitments(month)),
      Math.max(0, wealthAllocation(month)),
    ]),
  );

  return {
    activeMonthCount: activeMonths.length,
    averageFreeCashFlow,
    chartMaximum,
    highestCommitmentMonth,
    strongestMonth,
  };
}

export function percentageChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Months a report should actually plot.
 *
 * The API always returns twelve months, so the current year would otherwise
 * chart a run of empty future months and read as a collapse in activity. Past
 * years keep all twelve.
 */
export function monthsInScope<T extends { month: number }>(
  months: T[],
  year: number,
  now = new Date(),
): T[] {
  if (year !== now.getFullYear()) return months;
  const throughMonth = now.getMonth() + 1;
  return months.filter((month) => month.month <= throughMonth);
}

/**
 * The month a category spent the most in, as an index into the twelve-month
 * array. Null when nothing was spent, so callers never label a peak of zero.
 */
export function peakSpendingMonth(months: number[]) {
  let peak: { index: number; amount: number } | null = null;
  for (let index = 0; index < months.length; index += 1) {
    const amount = months[index];
    if (amount > 0 && (!peak || amount > peak.amount)) {
      peak = { index, amount };
    }
  }
  return peak;
}

export function buildTrendGeometry(
  values: number[],
  width = 600,
  height = 180,
  padding = 16,
  domain?: { minimum: number; maximum: number },
) {
  if (!values.length) {
    return { maximum: 0, minimum: 0, points: [] as TrendPoint[] };
  }

  const minimum = domain?.minimum ?? Math.min(...values);
  const maximum = domain?.maximum ?? Math.max(...values);
  const range = maximum - minimum;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const points = values.map((value, index) => ({
    x:
      values.length === 1
        ? width / 2
        : padding + (index / (values.length - 1)) * plotWidth,
    y: range === 0 ? height / 2 : padding + ((maximum - value) / range) * plotHeight,
  }));

  return { maximum, minimum, points };
}

export type AxisTick = {
  value: number;
  y: number;
};

/**
 * Gridline positions for a trend chart, in the same coordinate space as
 * buildTrendGeometry.
 *
 * Unlabelled gridlines at arbitrary pixel positions tell the reader nothing, so
 * ticks carry the value they represent. Zero is always included when it falls
 * inside the domain: whether a line sits above or below zero is the point of a
 * balance chart.
 */
export function buildAxisTicks(
  domain: { minimum: number; maximum: number },
  height = 180,
  padding = 16,
): AxisTick[] {
  const { minimum, maximum } = domain;
  const plotHeight = height - padding * 2;
  const range = maximum - minimum;
  const positionFor = (value: number) =>
    range === 0 ? height / 2 : padding + ((maximum - value) / range) * plotHeight;

  const values = new Set<number>([minimum, maximum, (minimum + maximum) / 2]);
  if (minimum < 0 && maximum > 0) {
    values.add(0);
  }

  return [...values]
    .sort((first, second) => second - first)
    .map((value) => ({ value, y: positionFor(value) }));
}
