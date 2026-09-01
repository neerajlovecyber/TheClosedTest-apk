/**
 * Lightweight, high-performance In-Memory LRU Cache with TTL for Hono
 * Drastically reduces database load for high-traffic read endpoints.
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const MAX_ENTRIES = 500

class SimpleMemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    // Refresh recency for LRU eviction (Map preserves insertion order)
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.data as T
  }

  set<T>(key: string, data: T, ttlSeconds = 5): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= MAX_ENTRIES) {
      // Evict least-recently-used entry
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }

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
export const userAuthCache = new SimpleMemoryCache()
