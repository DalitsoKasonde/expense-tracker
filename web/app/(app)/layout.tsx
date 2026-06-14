import type { ReactNode } from "react";
import { getAuthSession } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="shell">
      <div className="appChrome">
        <div className="inlineRow">
          <span className="eyebrow">Expense Tracker</span>
          <SignOutButton />
        </div>
        {children}
      </div>
      <BottomNav />
    </main>
  );
}
