import type { ReactNode } from "react";
import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Check if user has accounts; if not, show onboarding
  try {
    const response = await fetch(
      `${process.env.API_BASE_URL}/v1/accounts`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        cache: "no-store",
      }
    );

    if (response.ok) {
      const accounts = await response.json();
      if (!accounts || accounts.length === 0) {
        redirect("/onboarding");
      }
    }
  } catch (err) {
    console.error("Failed to check accounts", err);
  }

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
