import type { Route } from "next";
import Link from "next/link";

type SettingsOverviewCardProps = {
  href: Route;
  title: string;
  description: string;
  footer: string;
};

export function SettingsOverviewCard({
  href,
  title,
  description,
  footer,
}: SettingsOverviewCardProps) {
  return (
    <Link href={href} className="settingsOverviewCard">
      <div className="settingsOverviewCardHeader">
        <strong>{title}</strong>
        <span className="settingsOverviewAction">Open</span>
      </div>
      <p className="muted">{description}</p>
      <span className="settingsOverviewFooter">{footer}</span>
    </Link>
  );
}
