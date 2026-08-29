import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PACKAGE_NAME = "com.theneerajsec.theclosedtest";
const PLAY_STORE_MARKET_URL = `market://details?id=${PACKAGE_NAME}&showAllReviews=true`;
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_NAME}&showAllReviews=true`;

export const RATE_US_DISMISSED_KEY = "rate_us_banner_dismissed_until_v2";
export const RATE_US_RATED_KEY = "rate_us_has_rated_v2";
export const RATE_US_FIRST_SEEN_KEY = "rate_us_first_seen_ts_v2";

export const SNOOZE_SHORT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (for X dismiss)
export const SNOOZE_LONG_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (for "Maybe Later")
const MIN_USAGE_TIME_MS = 24 * 60 * 60 * 1000; // 24 hours minimum before prompt if no streak

export interface RatingEligibilityContext {
  streak?: number;
  reputation?: number;
  hasAppsOrMatches?: boolean;
  dueTasksCount?: number;
}

async function getStorageItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem(key);
    }
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function setStorageItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  } catch (e) {
    console.error(`[RatingManager] Failed to set storage item (${key}):`, e);
  }
}

export const RatingManager = {
  /**
   * Direct manual navigation to Play Store "Write a Review" screen.
   * Uses native market:// with web fallback.
   */
  async openPlayStoreListing(): Promise<void> {
    try {
      if (Platform.OS === "android") {
        const canOpenMarket = await Linking.canOpenURL(PLAY_STORE_MARKET_URL).catch(() => false);
        if (canOpenMarket) {
          await Linking.openURL(PLAY_STORE_MARKET_URL).catch(() => {});
          return;
        }
      }

      await Linking.openURL(PLAY_STORE_WEB_URL).catch(() => {});
    } catch (error) {
      console.error("[RatingManager] Failed to open Play Store:", error);
      Linking.openURL(PLAY_STORE_WEB_URL).catch(() => {});
    }
  },

  /**
   * Checks if user has already rated the app.
   */
  async hasRated(): Promise<boolean> {
    const val = await getStorageItem(RATE_US_RATED_KEY);
    return val === "true";
  },

  /**
   * Permanently marks the app as rated so the banner is never displayed again.
   */
  async markAsRated(): Promise<void> {
    await setStorageItem(RATE_US_RATED_KEY, "true");
  },

  /**
   * Smart Eligibility Engine based on UX best practices:
   * 1. Never show to users who have already reviewed.
   * 2. Respect snooze intervals (7 or 14 days).
   * 3. Avoid interrupting brand new users on day 0 before they've experienced value.
   * 4. Trigger during "Moments of Delight" (active streak >= 1, completed check-in, active testing).
   */
  async shouldShowBanner(context?: RatingEligibilityContext): Promise<boolean> {
    try {
      const rated = await this.hasRated();
      if (rated) return false;

      const dismissedUntil = await getStorageItem(RATE_US_DISMISSED_KEY);
      if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
        return false;
      }

      // Track first seen timestamp
      let firstSeen = await getStorageItem(RATE_US_FIRST_SEEN_KEY);
      if (!firstSeen) {
        firstSeen = Date.now().toString();
        await setStorageItem(RATE_US_FIRST_SEEN_KEY, firstSeen);
      }

      const elapsedMs = Date.now() - Number(firstSeen);

      // Moment of Delight condition:
      // High-engagement users (streak >= 1 or active apps/matches) are eligible immediately
      const hasEngagement =
        (context?.streak !== undefined && context.streak >= 1) ||
        Boolean(context?.hasAppsOrMatches) ||
        (context?.reputation !== undefined && context.reputation > 100);

      if (hasEngagement) {
        return true;
      }

      // If no streak yet, wait until at least 24 hours of app discovery
      return elapsedMs >= MIN_USAGE_TIME_MS;
    } catch {
      return false;
    }
  },

  /**
   * Snoozes the banner. Short snooze (7 days) or Long snooze (14 days).
   */
  async snoozeBanner(ms: number = SNOOZE_SHORT_MS): Promise<void> {
    const until = (Date.now() + ms).toString();
    await setStorageItem(RATE_US_DISMISSED_KEY, until);
  },
};
