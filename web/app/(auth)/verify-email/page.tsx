import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { VerifyEmailClient } from "./verify-email-client";

export default function VerifyEmailPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <section className="card card-pad-lg card-raised">
          <div className="mb-8 flex justify-center"><Brand centered priority /></div>
          <h1 className="text-center text-3xl font-semibold text-on-surface">Confirming your email</h1>
          {/* useSearchParams needs a Suspense boundary, or the whole route opts
              out of static rendering at build time. */}
          <Suspense fallback={<p className="statusText mt-6">Loading…</p>}>
            <VerifyEmailClient />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
