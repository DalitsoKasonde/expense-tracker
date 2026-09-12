"use client";

import { type FormEvent, useState } from "react";
import { postPublicJson } from "@/lib/public-api";

export function ForgotPasswordForm() {
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim().toLowerCase();
    setIsPending(true);
    setError("");

    try {
      await postPublicJson("/v1/auth/forgot-password", { email });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not send the reset link.");
    } finally {
      setIsPending(false);
    }
  }

  // The confirmation deliberately does not say whether an account exists — the
  // API answers the same way either way, and the screen has to match or it
  // gives away what the API is protecting.
  if (sent) {
    return (
      <p className="statusText mt-6" role="status">
        If that address has an account, a reset link is on its way. It works once and expires in an hour.
      </p>
    );
  }

  return (
    <form className="loginForm mt-6" onSubmit={(event) => void handleSubmit(event)} aria-busy={isPending}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required disabled={isPending} />
      </div>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Sending the link" : "Email me a reset link"}
      </button>
    </form>
  );
}
