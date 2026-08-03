import { LendingWorkspace } from "@/components/lending-workspace";
import {
  PageHeader,
  PageShell,
} from "@/components/ui";

export default function LoansPage() {
  return (
    <PageShell>
      <PageHeader
        title="Loans"
        subtitle="Manage creditors, record borrowed cash, and keep track of what people owe you."
        eyebrow="Loans"
      />
      <LendingWorkspace />
    </PageShell>
  );
}
