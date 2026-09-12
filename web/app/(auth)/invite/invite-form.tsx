"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiBaseUrl } from "@/lib/client-api";
import { postPublicJson } from "@/lib/public-api";
import { establishApiSession } from "@/lib/browser-auth";
import { signIn } from "next-auth/react";

type Invitation = { email: string; premiumMonths: number };

function describeMonths(months: number) {
  if (months <= 0) return "";
  return months === 1 ? "one month" : `${months} months`;
}

export function InviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(token ? "" : "This invitation link is missing its code.");
  const checked = useRef(false);

  // Mirrors the API's rules so a weak password is caught before the
  // invitation is spent on it.
  const checks = {
    minimumLength: [...password].length >= 8,
    hasLetterAndNumber: /\p{L}/u.test(password) && /\p{N}/u.test(password),
    maximumLength: new TextEncoder().encode(password).length <= 72,
  };
  const passwordIsValid = Object.values(checks).every(Boolean);
  const passwordsMatch = password === confirmPassword;

  useEffect(() => {
    if (!token || checked.current) {
      return;
    }
    checked.current = true;

    fetch(`${getApiBaseUrl()}/v1/auth/invitations?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error((await response.text()).trim() || "This invitation link is invalid or has expired.");
        }
        return (await response.json()) as Invitation;
      })
      .then(setInvitation)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "This invitation is not valid."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !invitation) {
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
      await postPublicJson("/v1/auth/invitations/accept", {
        token,
        password,
        displayName: displayName.trim(),
      });
      // Accepting signs the person in, but the browser session still has to be
      // established the same way a normal login does.
      await establishApiSession({ email: invitation.email, password });
      await signIn("credentials", { email: invitation.email, password, redirect: false });
      router.push("/onboarding");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not complete your invitation.");
      setIsPending(false);
    }
  }

  if (loading) {
    return <p className="statusText mt-6" role="status">Checking your invitation…</p>;
  }

  if (!invitation) {
    return (
      <div className="mt-6">
        <p className="field-error" role="alert">{error}</p>
        <p className="mt-3 text-sm text-on-surface-soft">
          Invitations expire after 14 days. Ask for a new one, or create an account yourself.
        </p>
        <Link href="/register" className="btn btn-ghost btn-block mt-4">Create an account</Link>
      </div>
    );
  }

  return (
    <form className="loginForm mt-6" onSubmit={(event) => void handleSubmit(event)} aria-busy={isPending}>
      <p className="statusText" role="status">
        Invitation for {invitation.email}
        {invitation.premiumMonths > 0 ? ` · ${describeMonths(invitation.premiumMonths)} of premium included` : ""}
      </p>

      <div className="field">
        <label htmlFor="displayName">Your name</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          required
          disabled={isPending}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="password">Choose a password</label>
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
        <label htmlFor="confirmPassword">Confirm password</label>
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
        {isPending ? "Setting up your account" : "Accept and start"}
      </button>
    </form>
  );
}
