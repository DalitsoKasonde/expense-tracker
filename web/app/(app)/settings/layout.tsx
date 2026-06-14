import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Settings</h1>
        <p className="muted">Manage the financial configuration that powers everyday entry and reporting.</p>
        <SettingsNav />
        {children}
      </section>
    </main>
  );
}

