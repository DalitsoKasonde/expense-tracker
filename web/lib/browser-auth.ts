"use client";

import { signOut as nextAuthSignOut } from "next-auth/react";
import { getApiBaseUrl } from "./client-api";

type Credentials = {
  email: string;
  password: string;
};

export async function establishApiSession(credentials: Credentials) {
  const response = await fetch(`${getApiBaseUrl()}/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Login failed");
  }
}

export async function clearApiSession() {
  try {
    await fetch(`${getApiBaseUrl()}/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Keep logout resilient even if the API is temporarily unreachable.
  }
}

export async function signOutEverywhere() {
  await clearApiSession();
  await nextAuthSignOut({ callbackUrl: "/login" });
}
