"use client";

import { type FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { postPublicJson } from "@/lib/public-api";

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  // Carried over from the sign-in page: someone who has just failed to
  // remember a password should not also have to retype the address that was
  // already on screen.
  const [email, setEmail] = useState(() => searchParams?.get("email")?.trim().toLowerCase() ?? "");
  const [isPending, setIsPending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setIsPending(true);
    setError("");

    try {
      await postPublicJson("/v1/auth/forgot-password", { email: normalizedEmail });
      setSentTo(normalizedEmail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not send the reset link.");
    } finally {
      setIsPending(false);
    }
  }

  // The confirmation deliberately does not say whether an account exists — the
  // API answers the same way either way, and the screen has to match or it
  // gives away what the API is protecting. Naming the address reveals nothing
  // extra (it is what was just typed) and is the only way to catch a typo
  // before spending ten minutes waiting for mail that was never addressed to
  // you.
  if (sentTo) {
    return (
      <div className="mt-6">
        <p className="statusText" role="status">
          {/* Bold only: .statusText carries its own colour, and overriding it
              here made the address read as a different kind of text rather
              than an emphasised part of the same sentence. */}
          If <strong className="font-bold">{sentTo}</strong> has an account, a reset link is on its
          way. It works once and expires in an hour.
        </p>
        <p className="field-hint mt-3">
          Nothing arriving? Check the spam folder, then try again with another address.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-block mt-4"
          onClick={() => {
            setSentTo("");
            setError("");
          }}
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form className="loginForm mt-6" onSubmit={(event) => void handleSubmit(event)} aria-busy={isPending}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          autoFocus={!email}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Sending the link" : "Email me a reset link"}
      </button>
    </form>
  );
}
