/**
 * Typed API Client for TheClosedTest
 * Connects React Native / Expo to the Northflank Hono + PostgreSQL Backend.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const TS_PROD_URL = "https://p01--tester--7tlh8kl746cq.code.run";
export const RUST_PROD_URL = "https://p01--backend-rs--7tlh8kl746cq.code.run";
export const PROD_API_URL = process.env.EXPO_PUBLIC_API_URL || TS_PROD_URL;
export const LOCAL_API_URL = process.env.EXPO_PUBLIC_LOCAL_API_URL || "http://192.168.1.4:9000";

const API_ENV_STORAGE_KEY = "api_env_override";
const API_CUSTOM_URL_STORAGE_KEY = "api_custom_url_override";

export type ApiEnv = "rust" | "ts" | "local" | "custom";

let apiBaseUrl = PROD_API_URL;
let envLoaded = false;

export async function loadApiEnv(): Promise<void> {
  if (envLoaded) return;
  envLoaded = true;
  try {
    const custom = await AsyncStorage.getItem(API_CUSTOM_URL_STORAGE_KEY);
    if (custom && custom.trim().length > 0) {
      apiBaseUrl = custom.trim().replace(/\/+$/, "");
      return;
    }

    const saved = await AsyncStorage.getItem(API_ENV_STORAGE_KEY);
    if (saved === "rust") {
      apiBaseUrl = RUST_PROD_URL;
    } else if (saved === "local") {
      apiBaseUrl = LOCAL_API_URL;
    } else {
      apiBaseUrl = PROD_API_URL;
    }
  } catch {
    // Fall back to default URL if storage is unavailable
  }
}

export function getApiEnv(): ApiEnv {
  const current = apiBaseUrl.trim().replace(/\/+$/, "");
  if (current === RUST_PROD_URL) return "rust";
  if (current === TS_PROD_URL || current === PROD_API_URL) return "ts";
  if (current === LOCAL_API_URL) return "local";
  return "custom";
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export async function setApiEnv(env: ApiEnv): Promise<void> {
  try {
    if (env === "rust") {
      apiBaseUrl = RUST_PROD_URL;
      await AsyncStorage.setItem(API_CUSTOM_URL_STORAGE_KEY, RUST_PROD_URL);
      await AsyncStorage.setItem(API_ENV_STORAGE_KEY, "rust");
    } else if (env === "ts") {
      apiBaseUrl = TS_PROD_URL;
      await AsyncStorage.setItem(API_CUSTOM_URL_STORAGE_KEY, TS_PROD_URL);
      await AsyncStorage.setItem(API_ENV_STORAGE_KEY, "ts");
    } else if (env === "local") {
      apiBaseUrl = LOCAL_API_URL;
      await AsyncStorage.setItem(API_CUSTOM_URL_STORAGE_KEY, LOCAL_API_URL);
      await AsyncStorage.setItem(API_ENV_STORAGE_KEY, "local");
    }
  } catch {
    // Ignore storage failures
  }
}

export async function setCustomApiUrl(url: string | null): Promise<void> {
  try {
    const cleaned = url ? url.trim().replace(/\/+$/, "") : "";
    if (!cleaned || cleaned === TS_PROD_URL || cleaned === PROD_API_URL) {
      apiBaseUrl = TS_PROD_URL;
      await AsyncStorage.removeItem(API_CUSTOM_URL_STORAGE_KEY);
      await AsyncStorage.setItem(API_ENV_STORAGE_KEY, "ts");
    } else if (cleaned === RUST_PROD_URL) {
      apiBaseUrl = RUST_PROD_URL;
      await AsyncStorage.setItem(API_CUSTOM_URL_STORAGE_KEY, RUST_PROD_URL);
      await AsyncStorage.setItem(API_ENV_STORAGE_KEY, "rust");
    } else if (cleaned === LOCAL_API_URL) {
      apiBaseUrl = LOCAL_API_URL;
      await AsyncStorage.setItem(API_CUSTOM_URL_STORAGE_KEY, LOCAL_API_URL);
      await AsyncStorage.setItem(API_ENV_STORAGE_KEY, "local");
    } else {
      apiBaseUrl = cleaned;
      await AsyncStorage.setItem(API_CUSTOM_URL_STORAGE_KEY, cleaned);
      await AsyncStorage.setItem(API_ENV_STORAGE_KEY, "custom");
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
  timeoutMs?: number;
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  await loadApiEnv();
  const { params, headers: customHeaders, timeoutMs = 15000, ...fetchOptions } = options;

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal || controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError" || controller.signal.aborted) {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s. Please check your internet connection.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

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
