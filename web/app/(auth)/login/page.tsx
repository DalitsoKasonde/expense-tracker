import { getAuthSession } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getAuthSession();

  if (session?.user) {
    redirect("/today");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-outline bg-surface p-6 shadow-md sm:p-8">
        <div className="mb-8 text-2xl font-bold text-primary">Chuma</div>
        <h1 className="text-3xl font-semibold text-on-surface">Welcome back</h1>
        <p className="mt-2 text-sm text-on-surface-soft">Sign in to see your accounts, goals, and latest money movement.</p>
        <LoginForm />
        <p className="mt-5 text-center text-sm text-on-surface-soft">
          New to Chuma?{" "}
          <Link href="/register" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}
