type Bps = number | null | undefined;

export type ExportReportMonth = {
  monthLabel: string;
  earnedIncome: number;
  borrowedIncome: number;
  totalInflow: number;
  livingExpenses: number;
  debtPrincipalPaid: number;
  debtInterestFees: number;
  savings: number;
  investments: number;
  operatingBalance: number;
  freeCashFlow: number;
  amountBroughtForward: number;
  endingCashBalance: number;
  netWorth: number;
  savingsRateBps?: Bps;
  debtBurdenRateBps?: Bps;
  interestLeakageBps?: Bps;
  borrowedDependencyBps?: Bps;
  wealthBuildRateBps?: Bps;
};

export type ExportAnnualReport = {
  year: number;
  data: ExportReportMonth[];
  ytd: ExportReportMonth;
};

type MoneyKey = Exclude<
  keyof ExportReportMonth,
  | "monthLabel"
  | "savingsRateBps"
  | "debtBurdenRateBps"
  | "interestLeakageBps"
  | "borrowedDependencyBps"
  | "wealthBuildRateBps"
>;

const moneyRows: Array<{
  label: string;
  value: (month: ExportReportMonth) => number;
  ytdValue?: (report: ExportAnnualReport) => number;
}> = [
  moneyRow("Earned income", "earnedIncome"),
  moneyRow("Borrowed income", "borrowedIncome"),
  moneyRow("Total inflow", "totalInflow"),
  moneyRow("Living expenses", "livingExpenses"),
  moneyRow("Debt principal paid", "debtPrincipalPaid"),
  moneyRow("Debt interest and fees", "debtInterestFees"),
  {
    label: "Cash commitments",
    value: (month) =>
      month.livingExpenses + month.debtPrincipalPaid + month.debtInterestFees,
  },
  moneyRow("Savings", "savings"),
  moneyRow("Investments", "investments"),
  moneyRow("Operating balance", "operatingBalance"),
  moneyRow("Free cash flow", "freeCashFlow"),
  {
    ...moneyRow("Amount brought forward", "amountBroughtForward"),
    ytdValue: (report) => report.data[0]?.amountBroughtForward ?? 0,
  },
  moneyRow("Ending cash balance", "endingCashBalance"),
  moneyRow("Net worth", "netWorth"),
];

const rateRows: Array<{
  label: string;
  value: (month: ExportReportMonth) => Bps;
}> = [
  rateRow("Savings rate", "savingsRateBps"),
  rateRow("Debt burden rate", "debtBurdenRateBps"),
  rateRow("Interest leakage", "interestLeakageBps"),
  rateRow("Borrowed dependency", "borrowedDependencyBps"),
  rateRow("Wealth build rate", "wealthBuildRateBps"),
];

function moneyRow(label: string, key: MoneyKey) {
  return { label, value: (month: ExportReportMonth) => Number(month[key] ?? 0) };
}

function rateRow(
  label: string,
  key:
    | "savingsRateBps"
    | "debtBurdenRateBps"
    | "interestLeakageBps"
    | "borrowedDependencyBps"
    | "wealthBuildRateBps",
) {
  return { label, value: (month: ExportReportMonth) => month[key] };
}

function escapeCsv(value: string | number) {
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function amountFromMinor(value: number) {
  return (value / 100).toFixed(2);
}

function rateFromBps(value: Bps) {
  if (value === null || value === undefined) return "";
  return `${(value / 100).toFixed(2)}%`;
}

function csvRow(values: Array<string | number>) {
  return values.map(escapeCsv).join(",");
}

export function buildAnnualReportCsv(
  report: ExportAnnualReport,
  currency: string,
  generatedAt = new Date(),
) {
  const rows = [
    csvRow(["Report", "Expenses financial report"]),
    csvRow(["Year", report.year]),
    csvRow(["Currency", currency]),
    csvRow(["Generated", generatedAt.toISOString().slice(0, 10)]),
    "",
    csvRow(["Metric", ...report.data.map((month) => month.monthLabel), "YTD"]),
  ];

  for (const row of moneyRows) {
    rows.push(
      csvRow([
        row.label,
        ...report.data.map((month) => amountFromMinor(row.value(month))),
        amountFromMinor(row.ytdValue ? row.ytdValue(report) : row.value(report.ytd)),
      ]),
    );
  }

  rows.push("");
  for (const row of rateRows) {
    rows.push(
      csvRow([
        row.label,
        ...report.data.map((month) => rateFromBps(row.value(month))),
        rateFromBps(row.value(report.ytd)),
      ]),
    );
  }

  return rows.join("\r\n");
}

export function annualReportFilename(year: number, currency: string) {
  const safeCurrency = currency.toUpperCase().replaceAll(/[^A-Z0-9_-]/g, "");
  return `expenses-report-${year}-${safeCurrency || "currency"}.csv`;
}
