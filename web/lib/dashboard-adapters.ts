import type { UnifiedDashboardAccountBalance } from "@/lib/use-unified-dashboard";

export type SavingsGoal = {
  id: string;
  accountId: string;
  name: string;
  targetMinor: number;
  currentMinor: number;
  currency: string;
};

type SavingsGroupResponse = {
  id?: string;
  accountId?: string;
  name?: string;
  targetMinor?: number | null;
  contributedMinor?: number;
  currentBalance?: number;
};

export function adaptSavingsGoals(
  groups: SavingsGroupResponse[] | null | undefined,
  accounts: UnifiedDashboardAccountBalance[] = [],
  defaultCurrency = "ZMW",
): SavingsGoal[] {
  return (groups ?? []).flatMap((group) => {
    if (!group.id || !group.name || !group.targetMinor || group.targetMinor <= 0) return [];
    const account = accounts.find((item) => item.accountId === group.accountId);
    return [{
      id: group.id,
      accountId: group.accountId ?? "",
      name: group.name,
      targetMinor: group.targetMinor,
      currentMinor: Math.max(0, group.currentBalance ?? group.contributedMinor ?? 0),
      currency: account?.currency ?? defaultCurrency,
    }];
  });
}
