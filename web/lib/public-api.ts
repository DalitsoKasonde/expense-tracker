"use client";

import { getApiBaseUrl } from "./client-api";

/**
 * POST to an endpoint that does not need a session.
 *
 * Password reset and email confirmation run before anyone is signed in, so they
 * cannot use `useApiCall`, which attaches a token. The API answers these with a
 * plain-text message on failure and either no body or JSON on success.
 */
export async function postPublicJson<T = null>(path: string, body: unknown): Promise<T | null> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });

  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || "Something went wrong. Please try again.");
  }

  if (response.status === 204) {
    return null;
  }

  return (await response.json()) as T;
}
