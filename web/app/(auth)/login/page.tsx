import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getAuthSession();

  if (session?.user) {
    redirect("/today");
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <span className="eyebrow">Expense Tracker</span>
        <h1 className="pageTitle">Track every expense, investment, and win.</h1>
        <p className="lede">
          Fast entry. Clear visibility. Built for you and your sister to manage money together.
        </p>
        <div className="pillList">
          <span className="pill">Invite-only auth</span>
          <span className="pill">PWA on your phone</span>
          <span className="pill">Account balances</span>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
