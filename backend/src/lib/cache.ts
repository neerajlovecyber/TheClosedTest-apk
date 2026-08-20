/**
 * Lightweight, high-performance In-Memory Cache with TTL for Hono
 * Drastically reduces database load for high-traffic read endpoints.
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class SimpleMemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  set<T>(key: string, data: T, ttlSeconds = 5): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  delete(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }
}

export const memoryCache = new SimpleMemoryCache()
