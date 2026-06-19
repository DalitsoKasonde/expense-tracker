import { useSession } from "next-auth/react";
import { useCallback } from "react";

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configuredBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured. Add it to web/.env.local.");
  }

  if (typeof window === "undefined") {
    return configuredBaseUrl;
  }

  const configuredUrl = new URL(configuredBaseUrl);
  const browserHostname = window.location.hostname;

  if (isLoopbackHostname(configuredUrl.hostname) && !isLoopbackHostname(browserHostname)) {
    configuredUrl.hostname = browserHostname;
    return configuredUrl.toString().replace(/\/$/, "");
  }

  return configuredBaseUrl;
}

function unreachableApiMessage(baseUrl: string) {
  return `Could not reach the API at ${baseUrl}. Make sure the Go API is running and your web env is using NEXT_PUBLIC_API_BASE_URL.`;
}

import { getCachedData, setCachedData, queuePendingTransaction } from "./offline-db";

async function performApiCall<T>(
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

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;
  const isGet = !options?.method || options.method === "GET";
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured. Add it to web/.env.local.");
  }

  if (!isGet) {
    // Mutation: POST/PUT/DELETE
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      if (error instanceof TypeError) {
        // If posting a transaction, queue it offline
        if (path === "/v1/transactions" && options.method === "POST") {
          const localId = await queuePendingTransaction(options.body);
          return {
            id: localId,
            ...(options.body as any),
            isPending: true,
          } as unknown as T;
        }
        throw new Error(unreachableApiMessage(baseUrl));
      }
      throw error;
    }

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
  } else {
    // Query: GET
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const text = await response.text();
        if (text) {
          const json = JSON.parse(text);
          // Cache successful API response
          void setCachedData(path, json);
          return json as T;
        }
      }
    } catch (error) {
      if (error instanceof TypeError) {
        // Network error: try reading from IndexedDB cache
        const cached = await getCachedData<T>(path);
        if (cached !== null) {
          return cached;
        }
        throw new Error(unreachableApiMessage(baseUrl));
      }
      throw error;
    }

    // Handle non-200 responses
    if (response && !response.ok) {
      const text = await response.text();
      throw new Error(text || `API error: ${response.status}`);
    }

    return undefined as T;
  }
}

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

      return performApiCall<T>(token, path, options);
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
  return performApiCall<T>(token, path, options);
}
