"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { establishApiSession } from "@/lib/browser-auth";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(formData: FormData) {
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

      setIsPending(false);

      if (result?.error) {
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
      className="grid gap-4 mt-6"
      action={(formData) => {
        void handleSubmit(formData);
      }}
    >
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      {error ? <p className="muted">{error}</p> : null}

      <button type="submit" className="primaryButton" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
