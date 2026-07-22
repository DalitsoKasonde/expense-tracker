import { LoansWorkspace } from "@/components/loans-workspace";
import { PageHeader } from "@/components/ui";

export default function LoansPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-app gap-8 px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader
        title="Loans"
        subtitle="Manage creditors, record borrowed cash, and track repayments alongside the rest of your capital picture."
        eyebrow="Loans"
      />
      <LoansWorkspace />
    </main>
  );
}
