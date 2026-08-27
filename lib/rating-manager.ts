import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { Linking, Platform } from "react-native";

const KEY_LAST_PROMPT_TIMESTAMP = "@theclosedtest_rating_last_prompt_ts";
const KEY_ACTION_COUNT = "@theclosedtest_rating_action_count";
const KEY_HAS_RATED = "@theclosedtest_rating_has_rated";

const PACKAGE_NAME = "com.theneerajsec.theclosedtest";

// Official Expo StoreReview recommended URL format for Android with showAllReviews=true
const PLAY_STORE_MARKET_URL = `market://details?id=${PACKAGE_NAME}&showAllReviews=true`;
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_NAME}&showAllReviews=true`;

// Guidelines from Expo StoreReview & Google Play Core:
// 1. Trigger after signature interactions (e.g. proof approval, streak milestone)
// 2. Do not spam user (14-day cooldown)
// 3. Minimum 2 positive actions before first prompt
const MIN_ACTIONS_FOR_REVIEW = 2;
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export const RatingManager = {
  /**
   * Invokes native In-App Review (expo-store-review) at signature interaction moments.
   * Uses StoreReview.hasAction() and StoreReview.requestReview() as per Expo documentation.
   */
  async recordHappyMomentAndCheckReview(reason?: string): Promise<boolean> {
    try {
      // 1. Increment interaction counter
      const rawCount = await AsyncStorage.getItem(KEY_ACTION_COUNT);
      const currentCount = (rawCount ? parseInt(rawCount, 10) : 0) + 1;
      await AsyncStorage.setItem(KEY_ACTION_COUNT, currentCount.toString());

      if (__DEV__) {
        console.log(`[RatingManager] Signature interaction recorded: "${reason || "unspecified"}" (total: ${currentCount})`);
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

      // Check if StoreReview has action available (per Expo documentation)
      const canReview = await StoreReview.hasAction().catch(() => false);
      if (!canReview) {
        return false;
      }

      // Record prompt timestamp
      await AsyncStorage.setItem(KEY_LAST_PROMPT_TIMESTAMP, now.toString());

      // Trigger native in-app review sheet
      await StoreReview.requestReview().catch(() => {});

      if (__DEV__) {
        console.log(`[RatingManager] StoreReview.requestReview() dispatched for "${reason}"`);
      }
      return true;
    } catch (error) {
      console.warn("[RatingManager] StoreReview check failed:", error);
      return false;
    }
  },

  /**
   * Direct manual navigation to Play Store "Write a Review" screen (e.g. from Settings > "Rate Us").
   * Uses the official Expo StoreReview pattern: market://details?id=...&showAllReviews=true
   */
  async openPlayStoreListing(): Promise<void> {
    try {
      await AsyncStorage.setItem(KEY_HAS_RATED, "true");

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
};
