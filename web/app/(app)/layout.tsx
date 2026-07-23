import type { ReactNode } from "react";
import { getAuthSession } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { PreferenceThemeSync } from "@/components/preference-theme-sync";
import { TopNav } from "@/components/top-nav";

function initialsFor(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "U";
  const parts = source
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "U";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    await apiFetch("/v1/auth/me", session.accessToken);
  } catch {
    redirect("/login");
  }

  // Onboarding completion is explicit so a partially saved account cannot
  // accidentally bypass the rest of setup.
  let onboarding: { completed: boolean } | null = null;
  let onboardingCheckFailed = false;
  try {
    onboarding = await apiFetch<{ completed: boolean }>("/v1/onboarding/status", session.accessToken);
  } catch (err) {
    console.error("Failed to check onboarding status", err);
    onboardingCheckFailed = true;
  }
  if (!onboardingCheckFailed && !onboarding?.completed) {
    redirect("/onboarding");
  }

  const initials = initialsFor(session.user?.name, session.user?.email);

  return (
    <>
      <PreferenceThemeSync />
      <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <SidebarNav />
        <div className="min-w-0">
          <TopNav initials={initials} email={session.user?.email} />
          {children}
        </div>
      </div>
      <BottomNav />
    </>
  );
}
