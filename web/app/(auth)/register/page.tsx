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
      {/* The width cap lives on the wrapper: `.card` declares max-width:100%
          after Tailwind's utilities, so a max-w-* on the card never applies. */}
      <div className="w-full max-w-md">
        <section className="card card-pad-lg card-raised">
          <div className="mb-8 flex justify-center"><Brand centered priority /></div>
          <h1 className="text-center text-3xl font-semibold text-on-surface">Create your account</h1>
          <p className="mt-2 text-center text-sm text-on-surface-soft">Start building a clearer view of your money.</p>
          <RegisterForm />
          <p className="mt-5 text-center text-sm text-on-surface-soft">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
