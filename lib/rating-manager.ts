import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { Linking, Platform } from "react-native";

const KEY_LAST_PROMPT_TIMESTAMP = "@theclosedtest_rating_last_prompt_ts";
const KEY_ACTION_COUNT = "@theclosedtest_rating_action_count";
const KEY_HAS_RATED = "@theclosedtest_rating_has_rated";

const PLAY_STORE_PACKAGE_ID = "com.theneerajsec.theclosedtest";
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE_ID}`;
const PLAY_STORE_MARKET_URL = `market://details?id=${PLAY_STORE_PACKAGE_ID}`;

// 2026 Google Play Best Practices:
// 1. Minimum 2 positive actions before prompting (avoids prompt on cold launch/day 0)
// 2. 14-day cooldown between in-app review requests (respects OS rate limits)
const MIN_ACTIONS_FOR_REVIEW = 2;
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export const RatingManager = {
  /**
   * Records a behavioral happy moment (e.g. proof approved, streak milestone, swap accepted).
   * Automatically invokes the native Google Play / iOS in-app review sheet when thresholds are met.
   */
  async recordHappyMomentAndCheckReview(reason?: string): Promise<boolean> {
    try {
      // 1. Increment successful interaction count
      const rawCount = await AsyncStorage.getItem(KEY_ACTION_COUNT);
      const currentCount = (rawCount ? parseInt(rawCount, 10) : 0) + 1;
      await AsyncStorage.setItem(KEY_ACTION_COUNT, currentCount.toString());

      if (__DEV__) {
        console.log(`[RatingManager] Happy moment recorded: "${reason || "unspecified"}" (total: ${currentCount})`);
      }

      // Check minimum required actions
      if (currentCount < MIN_ACTIONS_FOR_REVIEW) {
        return false;
      }

      // Check cooldown
      const rawLastPrompt = await AsyncStorage.getItem(KEY_LAST_PROMPT_TIMESTAMP);
      const lastPromptTs = rawLastPrompt ? parseInt(rawLastPrompt, 10) : 0;
      const now = Date.now();

      if (now - lastPromptTs < COOLDOWN_MS) {
        return false;
      }

      // Check if In-App Review API is available on this device/OS
      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) {
        return false;
      }

      // Update timestamp before triggering
      await AsyncStorage.setItem(KEY_LAST_PROMPT_TIMESTAMP, now.toString());

      // Trigger native in-app review card (Google Play Core)
      await StoreReview.requestReview();

      if (__DEV__) {
        console.log(`[RatingManager] In-App Review flow triggered successfully on "${reason}"`);
      }
      return true;
    } catch (error) {
      console.warn("[RatingManager] Failed to check or request in-app review:", error);
      return false;
    }
  },

  /**
   * Direct manual navigation to Play Store review listing (e.g. from Settings > "Rate Us").
   */
  async openPlayStoreListing(): Promise<void> {
    try {
      await AsyncStorage.setItem(KEY_HAS_RATED, "true");

      // Prefer native in-app review if available first
      if (await StoreReview.isAvailableAsync()) {
        await StoreReview.requestReview();
        return;
      }

      // Fallback to store deep link or web browser
      if (Platform.OS === "android") {
        const canOpenMarket = await Linking.canOpenURL(PLAY_STORE_MARKET_URL);
        if (canOpenMarket) {
          await Linking.openURL(PLAY_STORE_MARKET_URL);
          return;
        }
      }

      await Linking.openURL(PLAY_STORE_WEB_URL);
    } catch (error) {
      console.error("[RatingManager] Failed to open store URL:", error);
      Linking.openURL(PLAY_STORE_WEB_URL).catch(() => {});
    }
  },
};
