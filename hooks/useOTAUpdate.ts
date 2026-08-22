import * as React from "react";
import * as Updates from "expo-updates";

export function useOTAUpdate() {
  const [isUpdateDownloaded, setIsUpdateDownloaded] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);

  const checkAndDownloadUpdate = React.useCallback(async () => {
    if (__DEV__) return;

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setIsDownloading(true);
        await Updates.fetchUpdateAsync();
        setIsUpdateDownloaded(true);
      }
    } catch (error) {
      console.error("Error checking/fetching OTA update:", error);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const reloadApp = React.useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch (error) {
      console.error("Error reloading app:", error);
    }
  }, []);

  React.useEffect(() => {
    checkAndDownloadUpdate();
  }, [checkAndDownloadUpdate]);

  return {
    isUpdateDownloaded,
    isDownloading,
    reloadApp,
  };
}
