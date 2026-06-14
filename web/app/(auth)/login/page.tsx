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
      <section className="card loginCard">
        <h1 className="pageTitle">Sign in</h1>
        <p className="lede">
          Welcome back. Please enter your credentials to access your expense tracker.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
