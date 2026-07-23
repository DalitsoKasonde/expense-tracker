import { ApiRequestError } from "./api-error";

export async function apiFetch<T>(path: string, token?: string): Promise<T> {
  const apiBaseUrl = process.env.API_BASE_URL?.trim() || "http://127.0.0.1:8080";

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ApiRequestError(`API request failed: ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}
