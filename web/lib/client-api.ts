import { getSession } from "next-auth/react";

export async function apiCall<T>(
  path: string,
  options?: {
    method?: string;
    body?: any;
  }
): Promise<T> {
  const session = await getSession();
  const token = session?.accessToken;

  if (!token) {
    throw new Error("Not authenticated");
  }

  const url = `${process.env.NEXT_PUBLIC_API_BASE_URL}${path}`;
  
  const response = await fetch(url, {
    method: options?.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API error: ${response.status}`);
  }

  return response.json();
}
