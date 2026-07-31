import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings-nav";
import packageMetadata from "../../../package.json";
import { PageShell } from "@/components/ui";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell>
      <SettingsNav />
      <div className="grid min-w-0 gap-4">{children}</div>
      <footer
        className="justify-self-center pt-2 text-xs text-on-surface-soft"
        aria-label="Application version"
      >
        Expenses v{packageMetadata.version}
      </footer>
    </PageShell>
  );
}
