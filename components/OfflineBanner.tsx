import React, { useEffect, useState, useRef } from "react";
import { View, Animated, Platform, AppState } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { WifiOffIcon, WifiIcon } from "lucide-react-native";

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [showRestored, setShowRestored] = useState(false);
  const translateY = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    let isMounted = true;

    async function checkConnection() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        // Standard zero-native reachability ping
        const response = await fetch("https://clients3.google.com/generate_204", {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!isMounted) return;

        if (response.ok || response.status === 204) {
          setIsOffline(false);
          if (wasOffline) {
            setShowRestored(true);
            const timer = setTimeout(() => {
              Animated.timing(translateY, {
                toValue: -60,
                duration: 250,
                useNativeDriver: true,
              }).start(() => {
                if (isMounted) {
                  setShowRestored(false);
                  setWasOffline(false);
                }
              });
            }, 2500);
            return () => clearTimeout(timer);
          }
        } else {
          handleOffline();
        }
      } catch {
        if (isMounted) {
          handleOffline();
        }
      }
    }

    function handleOffline() {
      setIsOffline(true);
      setWasOffline(true);
      setShowRestored(false);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }

    checkConnection();

    // Check periodically & on app focus
    const interval = setInterval(checkConnection, 8000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkConnection();
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      sub.remove();
    };
  }, [wasOffline]);

  if (!isOffline && !showRestored) {
    return null;
  }

  return (
    <Animated.View
      style={{
        transform: [{ translateY }],
        top: Math.max(insets.top, Platform.OS === "ios" ? 44 : 24),
        position: "absolute",
        left: 16,
        right: 16,
        zIndex: 9999,
      }}
      className="pointer-events-none"
    >
      <View
        className={`flex-row items-center justify-center gap-2 py-2 px-4 rounded-2xl shadow-lg border ${
          isOffline
            ? "bg-amber-500/95 border-amber-600 dark:bg-amber-600/95"
            : "bg-emerald-600/95 border-emerald-700 dark:bg-emerald-700/95"
        }`}
      >
        <Icon as={isOffline ? WifiOffIcon : WifiIcon} className="text-white size-4" />
        <Text className="text-white text-xs font-bold text-center">
          {isOffline ? "You are offline. Reconnecting..." : "Back online! Syncing data..."}
        </Text>
      </View>
    </Animated.View>
  );
}
