"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { postPublicJson } from "@/lib/public-api";

type State = "checking" | "confirmed" | "failed";

export function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const [state, setState] = useState<State>(token ? "checking" : "failed");
  const [error, setError] = useState(token ? "" : "This link is missing its code.");
  // The token is spent on first use, so React's development double-effect
  // would otherwise burn it and report the second attempt as invalid.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) {
      return;
    }
    attempted.current = true;

    void postPublicJson("/v1/auth/verify-email", { token })
      .then(() => setState("confirmed"))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "We could not confirm your address.");
        setState("failed");
      });
  }, [token]);

  if (state === "checking") {
    return <p className="statusText mt-6" role="status">Confirming your address…</p>;
  }

  if (state === "confirmed") {
    return (
      <div className="mt-6">
        <p className="statusText" role="status">Your email address is confirmed. Thank you.</p>
        <Link href="/today" className="btn btn-primary btn-block mt-4">Go to Chuma</Link>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className="field-error" role="alert">{error}</p>
      <p className="mt-3 text-sm text-on-surface-soft">
        Confirmation links expire after two days. You can send yourself a new one from Settings › Preferences.
      </p>
      <Link href="/settings/preferences" className="btn btn-ghost btn-block mt-4">Open preferences</Link>
    </div>
  );
}
