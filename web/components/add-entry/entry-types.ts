export type EntryKind =
  | ""
  | "expense_living"
  | "income_earned"
  | "income_borrowed"
  | "debt_principal_payment"
  | "loan_receivable_advance"
  | "loan_receivable_repayment"
  | "saving_transfer"
  | "investment_buy";

/**
 * What the entry does to your money: cash out, cash in, a move between your own
 * accounts, an investment, or something that touches debt. The glyph and the
 * group heading carry the rest, so five tones cover eight kinds — and the
 * colour agrees with the green/red the ledger uses everywhere else.
 */
export type EntryTone = "expense" | "income" | "savings" | "investment" | "warning";

/**
 * Tokens only. These fills invert in dark mode and repaint entirely in the
 * Sonto scheme; a literal colour here renders as a glaring light chip on a
 * dark surface, which is exactly what this replaced.
 */
export const entryToneClass: Record<EntryTone, string> = {
  expense: "bg-expense-soft text-expense",
  income: "bg-income-soft text-income",
  savings: "bg-savings-soft text-savings",
  investment: "bg-investment-soft text-investment",
  warning: "bg-warning-soft text-warning",
};

export type EntryTypeOption = {
  value: Exclude<EntryKind, "">;
  label: string;
  description: string;
  symbol: string;
  tone: EntryTone;
};

/**
 * The picker's vocabulary, in the user's words rather than the ledger's.
 *
 * Grouping matters as much as the labels: "I lent someone money" and "I took a
 * loan" are easy to confuse until they sit under Lending and Borrowing.
 */
export const entryTypeGroups: Array<{ label: string; options: EntryTypeOption[] }> = [
  {
    label: "Everyday money",
    options: [
      {
        value: "expense_living",
        label: "I spent money",
        description: "Purchase, bill, fee, or everyday expense",
        symbol: "−",
        tone: "expense",
      },
      {
        value: "income_earned",
        label: "I received money",
        description: "Salary, payment, sale, or other income",
        symbol: "+",
        tone: "income",
      },
    ],
  },
  {
    label: "Move & grow",
    options: [
      {
        value: "saving_transfer",
        label: "I transferred money",
        description: "Move money between any two active accounts",
        symbol: "↔",
        tone: "savings",
      },
      {
        value: "investment_buy",
        label: "I bought an investment",
        description: "Add a stock or government bond purchase",
        symbol: "↗",
        tone: "investment",
      },
    ],
  },
  {
    label: "Lending",
    options: [
      {
        value: "loan_receivable_advance",
        label: "I lent someone money",
        description: "Track money another person owes you",
        symbol: "→",
        tone: "expense",
      },
      {
        value: "loan_receivable_repayment",
        label: "Someone repaid me",
        description: "Reduce money owed to you and add cash back",
        symbol: "←",
        tone: "income",
      },
    ],
  },
  {
    label: "Borrowing",
    options: [
      {
        value: "income_borrowed",
        label: "I took a loan",
        description: "Record borrowed money entering an account",
        symbol: "↓",
        tone: "warning",
      },
      {
        value: "debt_principal_payment",
        label: "I paid a loan",
        description: "Reduce the balance on an existing loan",
        symbol: "✓",
        tone: "warning",
      },
    ],
  },
];

export const entryTypes = entryTypeGroups.flatMap((group) => group.options);

export function entryTypeFor(entryKind: EntryKind) {
  return entryTypes.find((item) => item.value === entryKind);
}

/** Which category tree the chosen kind draws from. */
export function categoryGroupForEntryKind(entryKind: EntryKind) {
  switch (entryKind) {
    case "income_earned":
      return "income";
    case "saving_transfer":
      return "saving";
    case "investment_buy":
      return "investment";
    default:
      return "expense";
  }
}
