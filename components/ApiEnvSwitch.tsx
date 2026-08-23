import React from "react";
import { View, TouchableOpacity } from "react-native";
import { ServerIcon, WifiIcon } from "lucide-react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { getApiBaseUrl, getApiEnv, setApiEnv, type ApiEnv } from "@/lib/api";

const OPTIONS: Array<{ value: ApiEnv; label: string; icon: typeof ServerIcon }> = [
  { value: "local", label: "Local", icon: WifiIcon },
  { value: "prod", label: "Production", icon: ServerIcon },
];

export function ApiEnvSwitch() {
  const queryClient = useQueryClient();
  const [env, setEnvState] = React.useState<ApiEnv>(getApiEnv());

  const handleSelect = async (next: ApiEnv) => {
    if (next === env) return;
    await setApiEnv(next);
    setEnvState(next);
    await queryClient.invalidateQueries();
    Toast.show({
      type: "success",
      text1: next === "local" ? "Using local server" : "Using production server",
      text2: getApiBaseUrl(),
    });
  };

  return (
    <Card className="mx-4 mb-4 border-orange-400/40 bg-orange-500/5">
      <CardContent className="p-4 gap-3">
        <View className="flex-row items-center gap-2">
          <Icon as={ServerIcon} className="size-4 text-orange-500" />
          <Text className="text-sm font-bold text-foreground">Dev: API Server</Text>
        </View>
        <View className="flex-row gap-2">
          {OPTIONS.map((option) => {
            const isActive = env === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => void handleSelect(option.value)}
                activeOpacity={0.7}
                className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border ${
                  isActive ? "bg-primary border-primary" : "bg-background border-border"
                }`}
              >
                <Icon as={option.icon} className={`size-4 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                <Text className={`text-sm font-bold ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          Current: {getApiBaseUrl()}
        </Text>
      </CardContent>
    </Card>
  );
}
