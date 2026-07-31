"use client";

import { type FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { establishApiSession } from "@/lib/browser-auth";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setIsPending(true);
    setError("");

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    try {
      await establishApiSession({ email, password });

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setIsPending(false);
        setError("Login failed. Check your email, password, bootstrap env vars, and database connection.");
        return;
      }

      router.push("/today");
      router.refresh();
    } catch (error) {
      setIsPending(false);
      setError(error instanceof Error ? error.message : "Login failed. Please try again.");
    }
  }

  return (
    <form
      className={`loginForm mt-6 ${isPending ? "loginFormPending" : ""}`}
      onSubmit={(event) => void handleSubmit(event)}
      aria-busy={isPending}
    >
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required disabled={isPending} />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </div>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

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
          "Sign in"
        )}
      </button>

      {isPending ? (
        <p className="loginStatus" role="status">
          <span className="loginStatusPulse" aria-hidden="true" />
          Securing your session…
        </p>
      ) : null}
    </form>
  );
}
