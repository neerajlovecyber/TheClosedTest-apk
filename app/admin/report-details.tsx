import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { Icon } from "@/components/ui/icon";
import { ArrowLeftIcon } from "lucide-react-native";

export default function AdminReportDetailsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-4 py-3 border-b border-border flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()}>
          <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-foreground">Report Details</Text>
      </View>

      <View className="flex-1 items-center justify-center p-8">
        <Text className="text-muted-foreground">Report details available in admin console.</Text>
      </View>
    </SafeAreaView>
  );
}
