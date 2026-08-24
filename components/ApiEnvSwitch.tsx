import React from "react";
import { TouchableOpacity } from "react-native";
import { ServerIcon, WifiIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { getApiBaseUrl, getApiEnv, setApiEnv, type ApiEnv } from "@/lib/api";

export function ApiEnvSwitch() {
  const queryClient = useQueryClient();
  const [env, setEnvState] = React.useState<ApiEnv>(getApiEnv());

  const handleToggle = async () => {
    const next: ApiEnv = env === "local" ? "prod" : "local";
    await setApiEnv(next);
    setEnvState(next);
    await queryClient.invalidateQueries();
    Toast.show({
      type: "success",
      text1: next === "local" ? "Using Local Server" : "Using Production Server",
      text2: getApiBaseUrl(),
    });
  };

  const isLocal = env === "local";

  return (
    <TouchableOpacity
      onPress={() => void handleToggle()}
      className={`p-2.5 rounded-full border active:opacity-70 ${
        isLocal ? "bg-amber-500/10 border-amber-500/20" : "bg-sky-500/10 border-sky-500/20"
      }`}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityLabel={`API Server: ${isLocal ? "Local" : "Production"}`}
    >
      <Icon
        as={isLocal ? WifiIcon : ServerIcon}
        className={`size-5 ${isLocal ? "text-amber-500" : "text-sky-500"}`}
      />
    </TouchableOpacity>
  );
}
