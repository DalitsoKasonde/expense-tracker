import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings-nav";
import { PageShell } from "@/components/ui";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell>
      <SettingsNav />
      <div className="grid min-w-0 gap-4">{children}</div>
    </PageShell>
  );
}
