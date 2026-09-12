"use client";

import { type FormEvent, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { establishApiSession } from "@/lib/browser-auth";
import { postPublicJson } from "@/lib/public-api";

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [email, setEmail] = useState("");
  const [pinRequested, setPinRequested] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setIsPending(true);
    setError("");

    const normalizedEmail = String(formData.get("email") ?? "").trim().toLowerCase();

    try {
      let result;
      if (pinRequested) {
        result = await signIn("email-pin", {
          email: normalizedEmail,
          pin: String(formData.get("pin") ?? "").trim(),
          redirect: false,
        });
      } else {
        const password = String(formData.get("password") ?? "");
        await establishApiSession({ email: normalizedEmail, password });
        result = await signIn("credentials", {
          email: normalizedEmail,
          password,
          redirect: false,
        });
      }

      if (result?.error) {
        setIsPending(false);
        setError(pinRequested ? "That code is incorrect or has expired." : "Login failed. Check your email and password.");
        return;
      }

      const session = await getSession();
      router.push(session?.user?.role === "system_admin" ? "/admin" : "/today");
      router.refresh();
    } catch (error) {
      setIsPending(false);
      setError(error instanceof Error ? error.message : "Login failed. Please try again.");
    }
  }

  async function requestPIN() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email address first.");
      return;
    }
    setIsPending(true);
    setError("");
    setNotice("");
    try {
      await postPublicJson("/v1/auth/pin/request", { email: normalizedEmail });
      setPinRequested(true);
      setNotice("If that account is available, a six-digit code is on its way. It expires in 10 minutes.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send a sign-in code.");
    } finally {
      setIsPending(false);
    }
  }

  async function signInWithGoogle() {
    setIsPending(true);
    setError("");
    try {
      await signIn("google", { callbackUrl: "/today" });
    } catch {
      setError("Google sign-in could not be started. Please try again.");
    } finally {
      // The redirect normally takes the page away before this runs. When it
      // does not — a blocked redirect, a misconfigured provider — the form
      // would otherwise stay disabled with no way back.
      setIsPending(false);
    }
  }

  // The address is already typed here; carrying it over means a forgotten
  // password does not also cost retyping it on the next screen.
  const forgotPasswordHref = (
    email.trim()
      ? `/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`
      : "/forgot-password"
  ) as Route;

  return (
    <>
    <form
      className={`loginForm mt-6 ${isPending ? "loginFormPending" : ""}`}
      onSubmit={(event) => void handleSubmit(event)}
      aria-busy={isPending}
    >
      {googleEnabled ? (
        <>
          <button type="button" className="btn btn-ghost" disabled={isPending} onClick={() => void signInWithGoogle()}>
            Continue with Google
          </button>
          <div className="authDivider" aria-hidden="true"><span>or</span></div>
        </>
      ) : null}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (pinRequested) {
              setPinRequested(false);
              setNotice("");
            }
          }}
        />
      </div>

      {pinRequested ? (
        <div className="field">
          <label htmlFor="pin">Six-digit code</label>
          <input id="pin" name="pin" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={isPending} autoFocus />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required disabled={isPending} />
        </div>
      )}

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="statusText" role="status">{notice}</p> : null}

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? (
          <>
            <span className="loginSpinner" aria-hidden="true" />
            <span>Signing you in</span>
            <span className="loginProgressDots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </>
        ) : (
          pinRequested ? "Verify code" : "Sign in"
        )}
      </button>

      <button type="button" className="authTextButton" disabled={isPending} onClick={() => void requestPIN()}>
        {pinRequested ? "Send a new code" : "Email me a sign-in code"}
      </button>

      {pinRequested ? (
        <button type="button" className="authTextButton" disabled={isPending} onClick={() => { setPinRequested(false); setNotice(""); setError(""); }}>
          Use my password instead
        </button>
      ) : null}

      {isPending ? (
        <p className="loginStatus" role="status">
          <span className="loginStatusPulse" aria-hidden="true" />
          Securing your session…
        </p>
      ) : null}
    </form>

    <p className="mt-4 text-center text-sm">
      <Link href={forgotPasswordHref} className="font-semibold text-accent hover:underline">
        Forgot your password?
      </Link>
    </p>
    </>
  );
}
