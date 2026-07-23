import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings-nav";
import packageMetadata from "../../../package.json";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen content-start items-start max-w-app gap-4 px-4 py-4 pb-28 sm:px-8 lg:px-12 lg:py-5">
      <SettingsNav />
      <div className="grid min-w-0 gap-4">{children}</div>
      <footer
        className="justify-self-center pt-2 text-xs text-on-surface-soft"
        aria-label="Application version"
      >
        Expenses v{packageMetadata.version}
      </footer>
    </main>
  );
}
