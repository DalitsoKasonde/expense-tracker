import Link from "next/link";
import { Brand } from "@/components/brand";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <section className="card card-pad-lg card-raised">
          <div className="mb-8 flex justify-center"><Brand centered priority /></div>
          <h1 className="text-center text-3xl font-semibold text-on-surface">Forgot your password?</h1>
          <p className="mt-2 text-center text-sm text-on-surface-soft">
            Enter the email you signed up with and we will send you a link to set a new one.
          </p>
          <ForgotPasswordForm />
          <p className="mt-5 text-center text-sm text-on-surface-soft">
            Remembered it?{" "}
            <Link href="/login" className="font-semibold text-accent hover:underline">
              Back to sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
