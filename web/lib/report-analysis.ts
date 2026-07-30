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
