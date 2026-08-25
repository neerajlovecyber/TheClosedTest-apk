export function useOTAUpdate() {
  return {
    isUpdateDownloaded: false,
    isDownloading: false,
    reloadApp: async () => {},
  };
}
