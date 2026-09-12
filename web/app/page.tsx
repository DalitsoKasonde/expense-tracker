import type { Metadata } from "next";
import { getAuthSession } from "@/lib/auth";
import { hasVerifiedSession } from "@/lib/verified-session";
import { redirect } from "next/navigation";
import { HomePageContent } from "./home-page-content";

export const metadata: Metadata = {
  title: "Inscribed Expenses — personal finance for Zambia",
  description:
    "Track income, spending, savings, debts and investments across bank accounts, mobile money and cash. Built for Zambian finances.",
};

export default async function HomePage() {
  const session = await getAuthSession();

  // Someone already signed in wants their own figures, not the pitch. Everyone
  // else — including Google's OAuth reviewer, who is never signed in — gets the
  // public homepage rather than being bounced to /login.
  if (await hasVerifiedSession(session)) {
    if (session?.user?.role === "system_admin") {
      redirect("/admin");
    }
    redirect("/today");
  }

  return <HomePageContent />;
}
