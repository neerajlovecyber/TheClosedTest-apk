import { useEffect } from "react";
import { Platform } from "react-native";
import SpInAppUpdates, { IAUUpdateKind, StartUpdateOptions } from "sp-react-native-in-app-updates";

const inAppUpdates = new SpInAppUpdates(
  false, // isDebug: Set to true only for testing with 'fake' updates in debug mode if needed
);

export function useInAppUpdate() {
  useEffect(() => {
    if (Platform.OS !== "android" || __DEV__) return;

    const checkAndUpdate = async () => {
      try {
        const result = await inAppUpdates.checkNeedsUpdate();

        if (result.shouldUpdate) {
          const updateOptions: StartUpdateOptions = {
            updateType: IAUUpdateKind.FLEXIBLE, // User can keep using the app while downloading
          };

          await inAppUpdates.startUpdate(updateOptions);
        }
      } catch (error: any) {
        // Fail silently for dev / non-play-store builds (e.g. -10 ERROR_APP_NOT_OWNED)
        if (!error?.message?.includes("-10")) {
          console.warn("In-App Update check notice:", error?.message || error);
        }
      }
    };

    // Check for updates on mount
    checkAndUpdate();
  }, []);
}
