import { useSession } from "next-auth/react";
import { useCallback } from "react";
import {
  getCachedData,
  queuePendingTransaction,
  setCachedData,
  type JsonValue,
  type PendingTransactionPayload,
} from "./offline-db";

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8080";

  if (typeof window === "undefined") {
    return configuredBaseUrl;
  }

  if (configuredBaseUrl.startsWith("/")) {
    return configuredBaseUrl.replace(/\/$/, "");
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

function isPendingTransactionPayload(value: unknown): value is PendingTransactionPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ApiCallOptions = {
  method?: string;
  body?: JsonValue | Record<string, JsonValue | undefined>;
};

type PendingTransactionResult = PendingTransactionPayload & {
  id: string;
  isPending: true;
};

async function performApiCall<T>(
  token: string,
  path: string,
  options?: ApiCallOptions
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;
  const isGet = !options?.method || options.method === "GET";

  if (!isGet) {
    // Mutation: POST/PUT/DELETE
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        credentials: "include",
      });
    } catch (error) {
      if (error instanceof TypeError) {
        // If posting a transaction, queue it offline
        if (path === "/v1/transactions" && options.method === "POST" && isPendingTransactionPayload(options.body)) {
          const localId = await queuePendingTransaction(options.body);
          const pendingResult: PendingTransactionResult = {
            id: localId,
            ...options.body,
            isPending: true,
          };
          return pendingResult as T;
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
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
      options?: ApiCallOptions
    ): Promise<T> {
      const token = session?.accessToken;
      return performApiCall<T>(token ?? "", path, options);
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
  options?: ApiCallOptions
): Promise<T> {
  return performApiCall<T>(token, path, options);
}
