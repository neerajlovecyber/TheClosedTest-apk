/**
 * High-performance, In-Memory User Presence & Activity Tracker
 *
 * Tracks active users passively on authenticated requests with ZERO database overhead.
 * Automatically evicts stale entries and strictly bounds memory.
 */

const MAX_TRACKED_USERS = 50_000

class PresenceTracker {
  // Map of userId -> lastActiveEpochMs
  private activityMap = new Map<string, number>()

  /**
   * Record a user's activity timestamp.
   * Runs in O(1) time without any DB or async operations.
   */
  record(userId: string): void {
    if (!userId) return

    // If exists, delete first to refresh insertion order for LRU-like eviction
    if (this.activityMap.has(userId)) {
      this.activityMap.delete(userId)
    } else if (this.activityMap.size >= MAX_TRACKED_USERS) {
      // Evict oldest entry when capacity is reached
      const oldestKey = this.activityMap.keys().next().value
      if (oldestKey !== undefined) {
        this.activityMap.delete(oldestKey)
      }
    }

    this.activityMap.set(userId, Date.now())
  }

  /**
   * Returns whether a user was active within the given window in minutes.
   */
  isUserActive(userId: string, windowMinutes = 5): boolean {
    const lastActive = this.activityMap.get(userId)
    if (!lastActive) return false
    return Date.now() - lastActive <= windowMinutes * 60 * 1000
  }

  /**
   * Returns the count of unique active users within the specified window in minutes.
   * Lazily purges expired records older than 24 hours to prevent unbounded memory growth.
   */
  getActiveCount(windowMinutes = 5): number {
    const now = Date.now()
    const activeCutoff = now - windowMinutes * 60 * 1000
    const purgeCutoff = now - 24 * 60 * 60 * 1000 // Purge entries > 24h old

    let activeCount = 0

    for (const [userId, lastActive] of this.activityMap.entries()) {
      if (lastActive >= activeCutoff) {
        activeCount++
      } else if (lastActive < purgeCutoff) {
        this.activityMap.delete(userId)
      }
    }

    return activeCount
  }

  /**
   * Returns a breakdown of active users across multiple time windows.
   */
  getStats() {
    return {
      active5m: this.getActiveCount(5),
      active15m: this.getActiveCount(15),
      active1h: this.getActiveCount(60),
      active24h: this.getActiveCount(1440),
      totalTracked: this.activityMap.size,
    }
  }

  /**
   * Clear all tracked presence (useful for testing).
   */
  clear(): void {
    this.activityMap.clear()
  }
}

export const presence = new PresenceTracker()
