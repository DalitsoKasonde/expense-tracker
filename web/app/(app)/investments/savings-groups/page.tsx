"use client";

import { Breadcrumbs, PageHeader, PageShell } from "@/components/ui";
import SavingsGroupsManager from "../../settings/savings-groups/page";

export default function SavingsGroupsDashboardPage() {
  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Portfolio", href: "/investments" }, { label: "Savings groups" }]} />
      <PageHeader
        eyebrow="Savings group dashboard"
        title="Savings groups"
        subtitle="Create groups, correct cycle dates, monitor contributions, and record share-outs."
      />
      <SavingsGroupsManager />
    </PageShell>
  );
}
