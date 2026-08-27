import { Linking, Platform } from "react-native";

const PACKAGE_NAME = "com.theneerajsec.theclosedtest";
const PLAY_STORE_MARKET_URL = `market://details?id=${PACKAGE_NAME}&showAllReviews=true`;
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_NAME}&showAllReviews=true`;

export const RatingManager = {
  /**
   * Direct manual navigation to Play Store "Write a Review" screen (from Settings > "Rate Us").
   * Directly uses native market:// or web intent. Zero native modules, zero blank screen risks.
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
};
