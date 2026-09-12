import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { AdminNavigation } from "@/components/admin-navigation";
import { getAuthSession } from "@/lib/auth";
import { hasVerifiedSession } from "@/lib/verified-session";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();
  if (!(await hasVerifiedSession(session))) redirect("/login");
  if (session?.user?.role !== "system_admin") redirect("/today");
  return (
    <div className="adminShell min-h-dvh">
      <header className="adminHeader print:hidden">
        <div className="adminHeaderInner">
          <div className="adminBrandGroup"><Brand compact /><span className="adminContextChip">System administration</span></div>
          <SignOutButton className="btn btn-secondary" />
        </div>
      </header>
      <div className="adminFrame">
        <AdminNavigation />
        <main className="adminMain min-w-0">{children}</main>
      </div>
    </div>
  );
}
