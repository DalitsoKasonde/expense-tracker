"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { postPublicJson } from "@/lib/public-api";

/** What the API says when the token is spent, expired, or was never ours. */
function isDeadLinkMessage(message: string) {
  return message.toLowerCase().includes("invalid or has expired");
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [done, setDone] = useState(false);
  const [linkIsDead, setLinkIsDead] = useState(false);
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
      const message = caught instanceof Error ? caught.message : "We could not reset your password.";
      // A spent or expired link cannot be retried, so leaving the form on
      // screen only invites the same failure. Send them back for a new one.
      if (isDeadLinkMessage(message)) {
        setLinkIsDead(true);
      } else {
        setError(message);
      }
      setIsPending(false);
    }
  }

  if (!token || linkIsDead) {
    return (
      <div className="mt-6">
        <p className="field-error" role="alert">
          {token
            ? "This reset link has already been used or has expired."
            : "This link is missing its code. Open the link from your email directly."}
        </p>
        <p className="field-hint mt-3">
          Reset links work once and expire an hour after they are sent.
        </p>
        <Link href="/forgot-password" className="btn btn-primary btn-block mt-4">
          Ask for a new link
        </Link>
      </div>
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
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {/* The rules were already being evaluated on every keystroke and then
          collapsed into a single boolean, so the only way to discover a weak
          password was to submit. Showing them is what makes that comment
          true. */}
      {password ? (
        <ul className="field-hint grid gap-1" aria-live="polite">
          <Rule met={checks.minimumLength}>At least 8 characters</Rule>
          <Rule met={checks.hasLetterAndNumber}>Contains a letter and a number</Rule>
          {!checks.maximumLength ? <Rule met={false}>Too long — shorten it a little</Rule> : null}
        </ul>
      ) : (
        <p className="field-hint">At least 8 characters, including a letter and a number.</p>
      )}

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

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Setting your password" : "Set new password"}
      </button>
    </form>
  );
}

/**
 * One password rule. The tick is decorative — the rule's state is carried in
 * the text colour and announced through the list's live region, so a screen
 * reader is not read a bare glyph.
 */
function Rule({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <li className={met ? "flex items-center gap-2 text-positive" : "flex items-center gap-2"}>
      <span aria-hidden="true">{met ? "✓" : "•"}</span>
      <span>{children}</span>
    </li>
  );
}
