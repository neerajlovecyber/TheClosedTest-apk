import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { Icon } from "@/components/ui/icon";
import { ArrowLeftIcon, BarChart3Icon } from "lucide-react-native";
import { Card, CardContent } from "@/components/ui/card";
import { useLeaderboard } from "@/lib/api-hooks";

export default function AdminAnalyticsScreen() {
  const router = useRouter();
  const { data: leaderboardData } = useLeaderboard(50);
  const leaderboard = leaderboardData?.leaderboard || [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-4 py-3 border-b border-border flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()}>
          <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-foreground">Analytics</Text>
      </View>

      <ScrollView className="flex-1 p-4">
        <Card className="border-border bg-card mb-4">
          <CardContent className="p-4">
            <View className="flex-row items-center gap-3 mb-2">
              <Icon as={BarChart3Icon} className="text-primary size-6" />
              <Text className="text-lg font-bold text-foreground">System Metrics</Text>
            </View>
            <Text className="text-muted-foreground text-sm">Platform running on Northflank internal PostgreSQL 18 & Redis cache.</Text>
            <View className="mt-4 pt-4 border-t border-border flex-row justify-between">
              <Text className="text-sm font-semibold">Active Testers Indexed</Text>
              <Text className="text-sm font-bold text-primary">{leaderboard.length}</Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
