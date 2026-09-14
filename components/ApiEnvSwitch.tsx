import React, { useState, useEffect } from "react";
import { TouchableOpacity, View } from "react-native";
import { ServerIcon, ZapIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { getApiBaseUrl, getApiEnv, setCustomApiUrl, TS_PROD_URL, RUST_PROD_URL, type ApiEnv } from "@/lib/api";

export function ApiEnvSwitch() {
  const queryClient = useQueryClient();
  const [currentUrl, setCurrentUrl] = useState<string>(getApiBaseUrl());
  const [env, setEnvState] = useState<ApiEnv>(getApiEnv());

  useEffect(() => {
    setCurrentUrl(getApiBaseUrl());
    setEnvState(getApiEnv());
  }, []);

  const isRust = currentUrl.replace(/\/+$/, "") === RUST_PROD_URL;

  const handleToggle = async () => {
    const nextUrl = isRust ? TS_PROD_URL : RUST_PROD_URL;
    await setCustomApiUrl(nextUrl);
    const updated = getApiBaseUrl();
    setCurrentUrl(updated);
    setEnvState(getApiEnv());

    await queryClient.invalidateQueries();

    Toast.show({
      type: "success",
      text1: isRust ? "Switched to TypeScript Backend" : "Switched to Rust Backend 🦀",
      text2: nextUrl,
    });
  };

  return (
    <TouchableOpacity
      onPress={() => void handleToggle()}
      className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1.5 active:opacity-75 ${
        isRust
          ? "bg-orange-500/15 border-orange-500/40"
          : "bg-sky-500/10 border-sky-500/30"
      }`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={`Backend: ${isRust ? "Rust" : "TypeScript"}`}
    >
      <Icon
        as={isRust ? ZapIcon : ServerIcon}
        className={`size-4 ${isRust ? "text-orange-500" : "text-sky-500"}`}
      />
      <Text
        className={`text-xs font-bold ${
          isRust ? "text-orange-600 dark:text-orange-400" : "text-sky-600 dark:text-sky-400"
        }`}
      >
        {isRust ? "🦀 Rust" : "TS"}
      </Text>
    </TouchableOpacity>
  );
}
