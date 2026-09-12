import { Suspense } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { InviteForm } from "./invite-form";

export default function InvitePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <section className="card card-pad-lg card-raised">
          <div className="mb-8 flex justify-center"><Brand centered priority /></div>
          <h1 className="text-center text-3xl font-semibold text-on-surface">You are invited</h1>
          <p className="mt-2 text-center text-sm text-on-surface-soft">
            Set a password and your account is ready.
          </p>
          {/* useSearchParams needs a Suspense boundary, or the route opts out
              of static rendering at build time. */}
          <Suspense fallback={<p className="statusText mt-6">Loading…</p>}>
            <InviteForm />
          </Suspense>
          <p className="mt-5 text-center text-sm text-on-surface-soft">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-accent hover:underline">Sign in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
