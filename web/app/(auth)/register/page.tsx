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
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-outline bg-surface p-6 shadow-md sm:p-8">
        <div className="mb-8 text-2xl font-bold text-primary">Chuma</div>
        <h1 className="text-3xl font-semibold text-on-surface">Create your account</h1>
        <p className="mt-2 text-sm text-on-surface-soft">Start building a clearer view of your money.</p>
        <RegisterForm />
        <p className="mt-5 text-center text-sm text-on-surface-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
