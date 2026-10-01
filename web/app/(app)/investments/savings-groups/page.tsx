"use client";

import { Breadcrumbs, PageHeader, PageShell } from "@/components/ui";
import { InvestingHabitCard } from "@/components/investments/investing-habit-card";
import { habitFor } from "@/lib/investing-habit";
import { useInvestmentActivity } from "@/lib/use-investment-activity";
import { useUserCurrency } from "@/lib/use-user-currency";
import SavingsGroupsManager from "../../settings/savings-groups/page";

export default function SavingsGroupsDashboardPage() {
  const { activity, setTargets } = useInvestmentActivity();
  const { currency: userCurrency } = useUserCurrency();
  // A group's return only appears at share-out, so there is no running total
  // to lead with; what is worth showing mid-cycle is whether the
  // contributions are keeping up.
  const currencies = (activity?.scopes?.savings_group ?? []).map((item) => item.currency);

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Portfolio", href: "/investments" }, { label: "Savings groups" }]} />
      <PageHeader
        eyebrow="Savings group dashboard"
        title="Savings groups"
        subtitle="Create groups, correct cycle dates, monitor contributions, and record share-outs."
      />
      {currencies.map((currency) => {
        const habit = habitFor(activity, "savings_group", currency, userCurrency);
        return habit ? (
          <InvestingHabitCard key={currency} scope="savings_group" habit={habit} currency={currency} onTargetsChanged={setTargets} />
        ) : null;
      })}
      <SavingsGroupsManager />
    </PageShell>
  );
}
