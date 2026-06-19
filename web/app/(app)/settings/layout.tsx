import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { getAuthSession } from "@/lib/auth";
import { SettingsIcon } from "@/components/nav-icons";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();

  return (
    <main className="shell settingsShell">
      <section className="appChrome settingsChrome">
        <header className="settingsHero">
          <div className="settingsHeroMain">
            <div className="pageHeaderMain settingsHeroIdentity">
              <div className="headerBadge settingsHeroOrb" aria-hidden="true">
                <SettingsIcon />
              </div>
              <div className="titleCluster settingsHeroCopy">
                <p className="pageEyebrow settingsEyebrow">Inscribed workspace</p>
                <h1 className="settingsPageTitle">Settings</h1>
                <p className="settingsHeroScript">Arranged with quiet precision</p>
                <p className="pageLead settingsHeroLead">
                  Shape the defaults behind daily entry, portfolio review, import history, and the ledger itself.
                </p>
              </div>
            </div>

            <aside className="settingsHeroNote">
              <span className="settingsHeroNoteLabel">Session note</span>
              <strong>{session?.user?.email ?? "Signed in user"}</strong>
              <span className="muted">
                These settings affect the live workflow across Overview, History, Portfolio, imports, and quick entry.
              </span>
            </aside>
          </div>
        </header>

        <div className="settingsScaffold">
          <aside className="settingsRail">
            <SettingsNav />

            <section className="card settingsSessionPanel">
              <div className="settingsSessionIdentity">
                <span className="settingsSessionLabel">Session</span>
                <strong>Leave quietly when you are done.</strong>
                <span className="muted">
                  Log out after finishing account changes, category cleanup, or preference updates.
                </span>
              </div>
              <SignOutButton className="ghostButton settingsSessionButton" />
            </section>
          </aside>

          <div className="settingsCanvas">{children}</div>
        </div>
      </section>
    </main>
  );
}
