/**
 * Typed API Client for TheClosedTest
 * Connects React Native / Expo to the Northflank Hono + PostgreSQL Backend.
 */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://p01--tester--7tlh8kl746cq.code.run"

let authTokenGetter: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  authTokenGetter = getter
}

export interface ApiFetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { params, headers: customHeaders, ...fetchOptions } = options

  // Build Query String if params are provided
  let url = `${API_BASE_URL}${path}`
  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value))
      }
    }
    const queryString = searchParams.toString()
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString
    }
  }

  const headers = new Headers(customHeaders || {})
  if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  // Inject Clerk Bearer Token if available
  if (authTokenGetter) {
    try {
      const token = await authTokenGetter()
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`)
      }
    } catch (e) {
      console.warn("Failed to retrieve auth token for request:", e)
    }
  }

  const res = await fetch(url, {
    ...fetchOptions,
    headers,
  })

  if (!res.ok) {
    let errorMessage = `API Error ${res.status}: ${res.statusText}`
    try {
      const errorJson = await res.json()
      if (errorJson?.message) {
        errorMessage = errorJson.message
      }
    } catch {
      // ignore
    }
    throw new Error(errorMessage)
  }

  // Handle empty 204 or non-json responses
  if (res.status === 204) {
    return {} as T
  }

  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, options?: ApiFetchOptions) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
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
  delete: <T>(path: string, options?: ApiFetchOptions) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
}
