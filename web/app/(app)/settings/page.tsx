import type { Route } from "next";
import Link from "next/link";

const sections: Array<{
  href: Route;
  title: string;
  description: string;
}> = [
  {
    href: "/settings/preferences",
    title: "Preferences",
    description: "Default currency, theme, and notification preferences.",
  },
  {
    href: "/settings/accounts",
    title: "Accounts",
    description: "Manage wallets, bank accounts, and where money is stored.",
  },
  {
    href: "/settings/categories",
    title: "Categories",
    description: "Create grouped categories with optional parent-child structure.",
  },
  {
    href: "/settings/income-sources",
    title: "Income Sources",
    description: "Track salary, business income, freelance work, and other inflows.",
  },
  {
    href: "/settings/businesses",
    title: "Businesses",
    description: "Tag transactions to separate personal and business activity.",
  },
];

export default function SettingsOverviewPage() {
  return (
    <section className="settingsSection">
      <div className="card">
        <p className="muted">First milestone</p>
        <p>
          Settings is now organized around the configuration you use every day, starting with preferences,
          accounts, categories, income sources, and businesses.
        </p>
      </div>

      <div className="resourceList">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="card resourceBody">
            <strong>{section.title}</strong>
            <span className="muted">{section.description}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
