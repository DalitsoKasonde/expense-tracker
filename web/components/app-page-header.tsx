import type { ComponentType, ReactNode } from "react";

type AppPageHeaderProps = {
  eyebrow: string;
  title: string;
  lead?: string;
  accent?: string;
  icon: ComponentType<{ className?: string }>;
  action?: ReactNode;
};

export function AppPageHeader({
  eyebrow,
  title,
  lead,
  accent,
  icon: Icon,
  action,
}: AppPageHeaderProps) {
  return (
    <header className="pageHeader">
      <div className="pageHeaderMain">
        <div className="headerBadge" aria-hidden="true">
          <Icon />
        </div>
        <div className="titleCluster">
          <p className="pageEyebrow">{eyebrow}</p>
          <h1 className="pageTitle">{title}</h1>
          {accent ? <p className="pageAccent">{accent}</p> : null}
          {lead ? <p className="pageLead">{lead}</p> : null}
        </div>
      </div>

      {action ? <div className="pageHeaderAction">{action}</div> : null}
    </header>
  );
}
