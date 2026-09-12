"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { postPublicJson } from "@/lib/public-api";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Mirrors the API's rules so someone learns the password is too weak while
  // typing rather than after spending their one-use link on it.
  const checks = {
    minimumLength: [...password].length >= 8,
    hasLetterAndNumber: /\p{L}/u.test(password) && /\p{N}/u.test(password),
    maximumLength: new TextEncoder().encode(password).length <= 72,
  };
  const passwordIsValid = Object.values(checks).every(Boolean);
  const passwordsMatch = password === confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }
    if (!passwordIsValid) {
      setError("Choose a password with at least 8 characters, including a letter and a number.");
      return;
    }

    setIsPending(true);
    setError("");

    try {
      await postPublicJson("/v1/auth/reset-password", { token, password });
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not reset your password.");
      setIsPending(false);
    }
  }

  if (!token) {
    return (
      <p className="field-error mt-6" role="alert">
        This link is missing its code. Open the link from your email directly, or{" "}
        <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
          ask for a new one
        </Link>
        .
      </p>
    );
  }

  if (done) {
    return (
      <div className="mt-6">
        <p className="statusText" role="status">Your password is set. You can sign in with it now.</p>
        <button type="button" className="btn btn-primary btn-block mt-4" onClick={() => router.push("/login")}>
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <form className="loginForm mt-6" onSubmit={(event) => void handleSubmit(event)} aria-busy={isPending}>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        {confirmPassword && !passwordsMatch ? (
          <p className="field-error" role="alert">Passwords do not match.</p>
        ) : null}
      </div>

      <p className="field-hint">At least 8 characters, including a letter and a number.</p>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Setting your password" : "Set new password"}
      </button>
    </form>
  );
}
