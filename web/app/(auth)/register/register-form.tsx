"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/client-api";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError("");

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const displayName = String(formData.get("displayName") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsPending(false);
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Use at least 8 characters with a letter and a number.");
      setIsPending(false);
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
        credentials: "include",
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Registration failed. Please try again.");
        setIsPending(false);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      setIsPending(false);

      if (result?.error) {
        setError("Registration succeeded but login failed. Please try signing in.");
        return;
      }

      router.push("/today");
      router.refresh();
    } catch {
      setError("An error occurred. Please try again.");
      setIsPending(false);
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
        <label htmlFor="displayName">Name</label>
        <input id="displayName" name="displayName" type="text" required />
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <span className="muted">At least 8 characters with a letter and a number.</span>
      </div>

      <div className="field">
        <label htmlFor="confirmPassword">Confirm Password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </div>

      {error ? <p className="muted">{error}</p> : null}

      <button type="submit" className="primaryButton" disabled={isPending}>
        {isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
