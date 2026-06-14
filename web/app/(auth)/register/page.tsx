import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RegisterForm } from "./register-form";
import Link from "next/link";

export default async function RegisterPage() {
  const session = await getAuthSession();

  if (session?.user) {
    redirect("/today");
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <h1 className="pageTitle">Create your account</h1>
        <p className="lede">You have been invited to join Expense Tracker. Sign up to get started.</p>
        <RegisterForm />
        <p className="muted" style={{ textAlign: "center", marginTop: "1rem" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ textDecoration: "underline" }}>
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
