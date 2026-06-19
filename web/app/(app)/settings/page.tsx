import type { Route } from "next";
import { SettingsOverviewCard } from "@/components/settings-overview-card";

const sections: Array<{
  href: Route;
  title: string;
  description: string;
  footer: string;
}> = [
  {
    href: "/settings/preferences",
    title: "Preferences",
    description: "Set the default currency, theme, and alerts that shape the everyday Inscribed experience.",
    footer: "Interface and reminders",
  },
  {
    href: "/settings/accounts",
    title: "Accounts",
    description: "Define the wallets, banks, savings spaces, and investment homes behind live balances.",
    footer: "Balance structure",
  },
  {
    href: "/settings/categories",
    title: "Categories",
    description: "Keep expense, income, saving, and investment language clear enough for daily review and reporting.",
    footer: "Reporting taxonomy",
  },
  {
    href: "/settings/income-sources",
    title: "Income Sources",
    description: "Track salary, business revenue, freelance work, and investment income from a single source library.",
    footer: "Revenue origins",
  },
  {
    href: "/settings/businesses",
    title: "Businesses",
    description: "Separate personal and business-linked activity without turning the ledger into a full accounting suite.",
    footer: "Business context",
  },
];

export default function SettingsOverviewPage() {
  return (
    <section className="settingsSection settingsOverviewSection">
      <div className="settingsOverviewIntro">
        <article className="card settingsLeadCard">
          <p className="settingsLeadHeading">
            Keep the structure practical, the defaults quiet, and the ledger language unmistakably yours.
          </p>
          <p className="muted">
            The workspace below covers the five live systems that shape account behavior, reporting clarity, and
            everyday entry speed.
          </p>
        </article>

        <aside className="card settingsReferenceCard">
          <strong>Five sections. One composed control surface.</strong>
          <span className="muted">
            Start with preferences and accounts, then refine the language that powers history, imports, and portfolio
            review.
          </span>
        </aside>
      </div>

      <div className="settingsEditorialGrid">
        {sections.map((section) => (
          <SettingsOverviewCard key={section.href} {...section} />
        ))}
      </div>
    </section>
  );
}
