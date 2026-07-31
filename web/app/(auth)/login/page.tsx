import { getAuthSession } from "@/lib/auth";
import { hasVerifiedSession } from "@/lib/verified-session";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getAuthSession();

  if (await hasVerifiedSession(session)) {
    redirect("/today");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <section className="card card-pad-lg card-raised w-full max-w-md">
        <div className="mb-8 flex justify-center"><Brand centered priority /></div>
        <h1 className="text-center text-3xl font-semibold text-on-surface">Welcome back</h1>
        <p className="mt-2 text-center text-sm text-on-surface-soft">
          Sign in to see your accounts, goals, and latest money movement.
        </p>
        <LoginForm />
        <p className="mt-5 text-center text-sm text-on-surface-soft">
          New to Expenses?{" "}
          <Link href="/register" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}
