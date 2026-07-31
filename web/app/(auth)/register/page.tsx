import { getAuthSession } from "@/lib/auth";
import { hasVerifiedSession } from "@/lib/verified-session";
import { redirect } from "next/navigation";
import { RegisterForm } from "./register-form";
import Link from "next/link";
import { Brand } from "@/components/brand";

export default async function RegisterPage() {
  const session = await getAuthSession();

  if (await hasVerifiedSession(session)) {
    redirect("/today");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <section className="card card-pad-lg card-raised w-full max-w-md">
        <div className="mb-8"><Brand priority /></div>
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
