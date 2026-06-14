import { useSession } from "next-auth/react";
import { useCallback } from "react";

/**
 * Hook version for components - returns a function that can be called in useEffect/handlers
 * Automatically uses current session token
 */
export function useApiCall() {
  const { data: session } = useSession();

  return useCallback(
    async function boundApiCall<T>(
      path: string,
      options?: {
        method?: string;
        body?: unknown;
      }
    ): Promise<T> {
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

      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      if (!text) {
        return undefined as T;
      }

      return JSON.parse(text) as T;
    },
    [session?.accessToken]
  );
}

/**
 * Standalone function for one-off calls where you have the token
 * Use sparingly - prefer useApiCall hook
 */
export async function apiCallWithToken<T>(
  token: string,
  path: string,
  options?: {
    method?: string;
    body?: unknown;
  }
): Promise<T> {
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

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}
