import React from "react";
import { View } from "react-native";
import { AlertCircleIcon, RefreshCwIcon } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this content. Check your connection and try again.",
  onRetry,
  isRetrying = false,
  className = "",
}: ErrorStateProps) {
  return (
    <View className={`items-center justify-center py-10 px-6 ${className}`}>
      <View className="bg-red-500/10 p-4 rounded-full mb-4">
        <Icon as={AlertCircleIcon} className="size-8 text-red-500" />
      </View>
      <Text className="text-lg font-bold text-foreground mb-1">{title}</Text>
      <Text className="text-sm text-muted-foreground text-center mb-4">{message}</Text>
      {onRetry && (
        <Button variant="outline" size="sm" onPress={onRetry} disabled={isRetrying} className="flex-row items-center gap-2">
          <Icon as={RefreshCwIcon} className="size-4 text-foreground" />
          <Text>{isRetrying ? "Retrying..." : "Retry"}</Text>
        </Button>
      )}
    </View>
  );
}
