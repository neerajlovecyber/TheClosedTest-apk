/**
 * Typed API Client for TheClosedTest
 * Connects React Native / Expo to the Northflank Hono + PostgreSQL Backend.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PROD_API_URL = process.env.EXPO_PUBLIC_API_URL || "https://p01--tester--7tlh8kl746cq.code.run";
const LOCAL_API_URL = process.env.EXPO_PUBLIC_LOCAL_API_URL || "http://192.168.1.4:9000";

const API_ENV_STORAGE_KEY = "api_env_override";

export type ApiEnv = "prod" | "local";

let apiBaseUrl = PROD_API_URL;
let envLoaded = false;

async function loadApiEnv(): Promise<void> {
  if (envLoaded) return;
  envLoaded = true;
  try {
    const saved = await AsyncStorage.getItem(API_ENV_STORAGE_KEY);
    if (__DEV__ && saved === "local") {
      apiBaseUrl = LOCAL_API_URL;
    }
  } catch {
    // Fall back to default URL if storage is unavailable
  }
}

export function getApiEnv(): ApiEnv {
  return apiBaseUrl === LOCAL_API_URL ? "local" : "prod";
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export async function setApiEnv(env: ApiEnv): Promise<void> {
  apiBaseUrl = env === "local" ? LOCAL_API_URL : PROD_API_URL;
  try {
    if (env === "prod") {
      await AsyncStorage.removeItem(API_ENV_STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(API_ENV_STORAGE_KEY, "local");
    }
  } catch {
    // Ignore storage failures
  }
}

/** Dev builds can pre-select the local server via env var without touching storage. */
if (__DEV__ && process.env.EXPO_PUBLIC_DEFAULT_TO_LOCAL_API === "true") {
  apiBaseUrl = LOCAL_API_URL;
}

let authTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  authTokenGetter = getter;
}

export interface ApiFetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  await loadApiEnv();
  const { params, headers: customHeaders, ...fetchOptions } = options;

  // Build Query String if params are provided
  let url = `${apiBaseUrl}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  const headers = new Headers(customHeaders || {});
  if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Inject Clerk Bearer Token if available
  if (authTokenGetter) {
    try {
      const token = await authTokenGetter();
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch (e) {
      console.warn("Failed to retrieve auth token for request:", e);
    }
  }

  const res = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    let errorMessage = `API Error ${res.status}: ${res.statusText}`;
    try {
      const errorJson = await res.json();
      if (errorJson?.message) {
        errorMessage = errorJson.message;
      } else if (errorJson?.error) {
        errorMessage = typeof errorJson.error === "string" ? errorJson.error : JSON.stringify(errorJson.error);
      } else if (errorJson?.issues) {
        errorMessage = errorJson.issues.map((i: any) => `${i.path?.join(".")}: ${i.message}`).join(", ");
      }
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  // Handle empty 204 or non-json responses
  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: ApiFetchOptions) => apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(path, {
      ...options,
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(path, {
      ...options,
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  delete: <T>(path: string, options?: ApiFetchOptions) => apiFetch<T>(path, { ...options, method: "DELETE" }),
};
