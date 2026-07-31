import Link from "next/link";
import {
  PageHeader,
  PageShell,
} from "@/components/ui";
import { moreNavigation } from "@/components/app-navigation";

export default function MorePage() {
  return (
    <PageShell>
      <PageHeader title="More" subtitle="Loans, goals, reports, imports, and account setup." />
      <nav className="grid gap-3 sm:grid-cols-2" aria-label="More destinations">
        {moreNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card card-interactive group grid min-h-24 gap-1"
          >
            <strong className="text-base text-on-surface group-hover:text-primary">{item.label}</strong>
            <span className="text-sm text-on-surface-soft">{item.description}</span>
          </Link>
        ))}
      </nav>
    </PageShell>
  );
}
