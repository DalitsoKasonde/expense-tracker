import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { getAuthSession } from "@/lib/auth";
import { hasVerifiedSession } from "@/lib/verified-session";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();
  if (!(await hasVerifiedSession(session))) redirect("/login");
  if (session?.user?.role !== "system_admin") redirect("/today");
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-outline bg-surface print:hidden">
        <div className="mx-auto flex max-w-app items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-12">
          <div className="flex items-center gap-4"><Brand compact /><span className="metaBadge">System administration</span></div>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
