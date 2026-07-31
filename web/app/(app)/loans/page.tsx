import { LoansWorkspace } from "@/components/loans-workspace";
import {
  PageHeader,
  PageShell,
} from "@/components/ui";

export default function LoansPage() {
  return (
    <PageShell>
      <PageHeader
        title="Loans"
        subtitle="Manage creditors, record borrowed cash, and track repayments alongside the rest of your capital picture."
        eyebrow="Loans"
      />
      <LoansWorkspace />
    </PageShell>
  );
}
