"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/client-api";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordChecks = {
    minimumLength: [...password].length >= 8,
    maximumLength: new TextEncoder().encode(password).length <= 72,
    hasLetterAndNumber: /\p{L}/u.test(password) && /\p{N}/u.test(password),
  };
  const passwordIsValid = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password === confirmPassword;

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError("");

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const submittedPassword = String(formData.get("password") ?? "");
    const displayName = String(formData.get("displayName") ?? "");
    const submittedConfirmation = String(formData.get("confirmPassword") ?? "");

    if (submittedPassword !== submittedConfirmation) {
      setError("Passwords do not match.");
      setIsPending(false);
      return;
    }
    if (!passwordIsValid) {
      setError("Use at least 8 characters with a letter and a number.");
      setIsPending(false);
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: submittedPassword, displayName }),
        credentials: "include",
      });

      if (!response.ok) {
        const message = (await response.text()).trim();
        setError(message || "Registration failed. Please try again.");
        setIsPending(false);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password: submittedPassword,
        redirect: false,
      });

      setIsPending(false);

      if (result?.error) {
        setError("Registration succeeded but login failed. Please try signing in.");
        return;
      }

      router.push("/today");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Could not reach the registration service. Please try again shortly."
          : "Registration failed. Please try again.",
      );
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
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          aria-invalid={password.length > 0 && !passwordIsValid}
          aria-describedby="password-requirements"
          onChange={(event) => {
            setPassword(event.target.value);
            setError("");
          }}
          required
        />
        <ul id="password-requirements" className="grid gap-1 text-xs text-on-surface-soft">
          <PasswordRequirement met={passwordChecks.minimumLength}>
            At least 8 characters
          </PasswordRequirement>
          <PasswordRequirement met={passwordChecks.hasLetterAndNumber}>
            Includes a letter and a number
          </PasswordRequirement>
          <PasswordRequirement met={passwordChecks.maximumLength}>
            No more than 72 bytes
          </PasswordRequirement>
        </ul>
      </div>

      <div className="field">
        <label htmlFor="confirmPassword">Confirm Password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
          aria-describedby={confirmPassword.length > 0 && !passwordsMatch ? "password-match-error" : undefined}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setError("");
          }}
          required
        />
        {confirmPassword.length > 0 && !passwordsMatch ? (
          <span id="password-match-error" className="text-xs text-negative">
            Passwords do not match.
          </span>
        ) : null}
      </div>

      {error ? <p className="text-sm text-negative" role="alert">{error}</p> : null}

      <button type="submit" className="primaryButton" disabled={isPending}>
        {isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}

function PasswordRequirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={met ? "text-income" : undefined}>
      <span aria-hidden="true">{met ? "✓" : "○"}</span>{" "}
      {children}
    </li>
  );
}
