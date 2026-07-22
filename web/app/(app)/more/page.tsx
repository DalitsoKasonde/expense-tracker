import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { moreNavigation } from "@/components/app-navigation";

export default function MorePage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-app content-start gap-6 px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader title="More" subtitle="Loans, goals, reports, imports, and account setup." />
      <nav className="grid gap-3 sm:grid-cols-2" aria-label="More destinations">
        {moreNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group grid min-h-24 gap-1 rounded-lg border border-outline bg-surface p-5 shadow-sm transition-colors hover:border-outline-strong hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <strong className="text-base text-on-surface group-hover:text-primary">{item.label}</strong>
            <span className="text-sm text-on-surface-soft">{item.description}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
