import type { Route } from "next";

export type NextStep = {
  label: string;
  href: Route;
};

export type NextStepInput = {
  /** Interests chosen during onboarding, e.g. "loans", "stocks", "bonds". */
  interests: string[];
  hasLiabilityAccount: boolean;
  hasStock: boolean;
  hasBond: boolean;
  accountCount: number;
  goalCount: number;
  incomeMinor: number;
  expenseMinor: number;
};

/**
 * Suggestions for the "Next steps" card.
 *
 * Setup tasks come first because they answer something the user already asked
 * for at onboarding. The nudges after them exist so the card is never a dead
 * end: "nothing needs attention" is true but useless, and the quiet months are
 * exactly when a prompt to record income is worth having.
 */
export function buildNextSteps(input: NextStepInput): NextStep[] {
  const steps: NextStep[] = [];

  if (input.interests.includes("loans") && !input.hasLiabilityAccount) {
    steps.push({ label: "Add the first loan you want Chuma to track", href: "/loans" as Route });
  }
  if (input.interests.includes("stocks") && !input.hasStock) {
    steps.push({ label: "Add your first stock holding", href: "/investments/add" });
  }
  if (input.interests.includes("bonds") && !input.hasBond) {
    steps.push({ label: "Add your first government bond", href: "/investments/add" });
  }

  if (input.accountCount === 0) {
    steps.push({ label: "Add the account your money sits in", href: "/settings/accounts" });
  }
  if (input.incomeMinor === 0) {
    steps.push({ label: "Record this month's income", href: "/add" });
  } else if (input.expenseMinor === 0) {
    steps.push({ label: "Record what you have spent this month", href: "/add" });
  }
  if (input.goalCount === 0) {
    steps.push({ label: "Set a savings goal to work towards", href: "/goals" as Route });
  }

  // More than a few suggestions stops reading as guidance and starts reading as
  // a backlog, so the card shows the first handful only.
  return steps.slice(0, 4);
}
