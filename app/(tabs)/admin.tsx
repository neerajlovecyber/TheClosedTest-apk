import React, { useState } from "react";
import { View, TouchableOpacity, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import {
  ActivityIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  LayersIcon,
  BarChart3Icon,
  TrendingUpIcon,
  UserCogIcon,
  XIcon,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAdminStats, useAdminUnbanUser } from "@/lib/api-hooks";
import { AdminServerUrlCard } from "@/components/AdminServerUrlCard";
import { toast } from "@/lib/sonner";

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { data: stats } = useAdminStats();
  const totalUsersCount = stats?.totalUsers ?? 0;
  const activeOnlineUsers = stats?.activeUsers ?? 0;
  const activeUsers24h = stats?.activeUsers24h ?? activeOnlineUsers;
  const activeMatchesCount = stats?.activeMatches ?? 0;
  const totalAppsCount = stats?.totalApps ?? 0;
  const weeklyActiveUsers = stats?.weeklyActiveUsers ?? [];

  const [showUnbanModal, setShowUnbanModal] = useState(false);
  const [unbanInput, setUnbanInput] = useState("");
  const [isUnbanning, setIsUnbanning] = useState(false);
  const unbanMutation = useAdminUnbanUser();

  const handleQuickUnban = async () => {
    const query = unbanInput.trim();
    if (!query) {
      toast.error("Please enter an email or user ID");
      return;
    }
    setIsUnbanning(true);
    try {
      const isEmail = query.includes("@");
      const res = await unbanMutation.mutateAsync({
        userId: isEmail ? undefined : query,
        email: isEmail ? query : undefined,
        restoreReputation: true,
        unpauseApps: true,
      });
      toast.success("User Reinstated", {
        description: res.message || `${query} has been unbanned with 100 reputation.`,
      });
      setUnbanInput("");
      setShowUnbanModal(false);
    } catch (err: any) {
      toast.error("Unban Failed", {
        description: err.message || "Could not unban user. Please verify the email or ID.",
      });
    } finally {
      setIsUnbanning(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="px-6 pt-6 pb-4">
        <Text className="text-3xl font-extrabold text-foreground tracking-tight">Admin</Text>
        <Text className="text-sm text-muted-foreground mt-0.5">Dashboard &amp; Overview</Text>
      </View>

      <ScreenScrollView className="flex-1 px-4">
        {/* Key Metrics - Hero Cards */}
        <View className="flex-row gap-3 mb-4">
          <Card className="border-border shadow-sm h-32 bg-card flex-1">
            <CardContent className="p-4 flex-1 justify-between">
              <View className="flex-row items-start justify-between">
                <View className="bg-blue-500/10 p-2 rounded-lg">
                  <Icon as={ActivityIcon} className="text-blue-500 size-5" />
                </View>
                <View className="flex-row items-center gap-1 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <Text className="text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                    {activeOnlineUsers} online
                  </Text>
                </View>
              </View>
              <View>
                <Text className="text-3xl font-extrabold text-foreground tracking-tight">{activeUsers24h}</Text>
                <Text className="text-xs text-muted-foreground font-medium mt-1">Active Today · {totalUsersCount} Total</Text>
              </View>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm h-32 bg-card flex-1">
            <CardContent className="p-4 flex-1 justify-between">
              <View className="flex-row items-start justify-between">
                <View className="bg-emerald-500/10 p-2 rounded-lg">
                  <Icon as={LayersIcon} className="text-emerald-500 size-5" />
                </View>
                <View className="bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
                  <Text className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-wider">Apps</Text>
                </View>
              </View>
              <View>
                <Text className="text-3xl font-extrabold text-foreground tracking-tight">{totalAppsCount}</Text>
                <Text className="text-xs text-muted-foreground font-medium mt-1">Total Apps ({activeMatchesCount} Tests)</Text>
              </View>
            </CardContent>
          </Card>
        </View>

        {/* 7-Day Activity Trend Card */}
        {weeklyActiveUsers.length > 0 && (
          <Card className="border-border shadow-sm mb-6 bg-card">
            <CardContent className="p-4">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <View className="bg-primary/10 p-1.5 rounded-lg">
                    <Icon as={BarChart3Icon} className="text-primary size-4" />
                  </View>
                  <Text className="font-bold text-sm text-foreground">7-Day Daily Active Users</Text>
                </View>
                <View className="flex-row items-center gap-1 bg-muted px-2 py-0.5 rounded-full">
                  <Icon as={TrendingUpIcon} className="text-emerald-500 size-3" />
                  <Text className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Avg {Math.round(weeklyActiveUsers.reduce((sum, d) => sum + d.count, 0) / weeklyActiveUsers.length)}/day
                  </Text>
                </View>
              </View>

              {/* Bar Chart Columns */}
              <View className="flex-row items-end justify-between h-28 pt-2 px-1">
                {weeklyActiveUsers.map((item, index) => {
                  const isToday = index === weeklyActiveUsers.length - 1;
                  const maxCount = Math.max(...weeklyActiveUsers.map((d) => d.count), 1);
                  const barHeightPercent = Math.max(10, Math.round((item.count / maxCount) * 100));

                  const dayDate = new Date(item.date + "T00:00:00Z");
                  const dayName = isToday
                    ? "Today"
                    : dayDate.toLocaleDateString("en-US", { weekday: "short" });

                  return (
                    <View key={item.date} className="items-center flex-1 mx-0.5">
                      {/* Value label */}
                      <Text
                        className={`text-[10px] font-bold mb-1 ${
                          isToday ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {item.count}
                      </Text>

                      {/* Bar Pillar */}
                      <View className="w-full max-w-[28px] h-16 bg-muted/60 dark:bg-muted/40 rounded-t-md justify-end overflow-hidden">
                        <View
                          style={{ height: `${barHeightPercent}%` }}
                          className={`w-full rounded-t-md ${
                            isToday ? "bg-primary" : "bg-primary/40 dark:bg-primary/30"
                          }`}
                        />
                      </View>

                      {/* Day Label */}
                      <Text
                        className={`text-[10px] mt-1 font-medium ${
                          isToday
                            ? "text-primary font-bold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {dayName}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Management &amp; Controls</Text>

        {/* User Moderation & Unban Card */}
        <Card className="border-border shadow-sm mb-3">
          <TouchableOpacity className="flex-row items-center justify-between p-4" onPress={() => setShowUnbanModal(true)}>
            <View className="flex-row items-center flex-1 mr-2">
              <View className="bg-amber-500/10 p-2.5 rounded-xl mr-3">
                <Icon as={UserCogIcon} className="text-amber-600 size-5" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-foreground">User Moderation &amp; Unban</Text>
                <Text className="text-xs text-muted-foreground">Reinstate accounts, restore reputation &amp; unpause apps</Text>
              </View>
            </View>
            <Icon as={ChevronRightIcon} className="text-muted-foreground size-5" />
          </TouchableOpacity>
        </Card>

        {/* App Management */}
        <Card className="border-border shadow-sm mb-3">
          <TouchableOpacity className="flex-row items-center justify-between p-4" onPress={() => router.push("/admin/apps-list" as any)}>
            <View className="flex-row items-center">
              <View className="bg-blue-500/10 p-2.5 rounded-xl mr-3">
                <Icon as={LayersIcon} className="text-blue-600 size-5" />
              </View>
              <View>
                <Text className="font-semibold text-foreground">App Management</Text>
                <Text className="text-xs text-muted-foreground">Search, delete apps &amp; clean duplicates</Text>
              </View>
            </View>
            <Icon as={ChevronRightIcon} className="text-muted-foreground size-5" />
          </TouchableOpacity>
        </Card>

        {/* Support Inbox */}
        <Card className="border-border shadow-sm mb-4">
          <TouchableOpacity className="flex-row items-center justify-between p-4" onPress={() => router.push("/admin/chats-list" as any)}>
            <View className="flex-row items-center">
              <View className="bg-purple-500/10 p-2.5 rounded-xl mr-3">
                <Icon as={MessageSquareIcon} className="text-purple-600 size-5" />
              </View>
              <View>
                <Text className="font-semibold text-foreground">Support Inbox</Text>
                <Text className="text-xs text-muted-foreground">Find users, manage tickets &amp; chat directly</Text>
              </View>
            </View>
            <Icon as={ChevronRightIcon} className="text-muted-foreground size-5" />
          </TouchableOpacity>
        </Card>

        {/* Server & Environment Configuration */}
        <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Server &amp; Environment</Text>
        <AdminServerUrlCard />
      </ScreenScrollView>

      {/* Quick Unban Modal */}
      <Modal visible={showUnbanModal} animationType="slide" transparent onRequestClose={() => setShowUnbanModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 justify-end bg-black/60">
          <View className="bg-card rounded-t-3xl border-t border-border shadow-2xl p-6">
            <View className="flex-row items-center justify-between pb-4 border-b border-border/50">
              <View className="flex-row items-center gap-2.5">
                <View className="p-2.5 rounded-xl bg-amber-500/10">
                  <Icon as={UserCogIcon} className="size-5 text-amber-600" />
                </View>
                <View>
                  <Text className="text-lg font-bold text-foreground">Reinstate / Unban User</Text>
                  <Text className="text-xs text-muted-foreground">Restore testing access &amp; reset reputation</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowUnbanModal(false)}
                className="p-2 rounded-full bg-secondary/60 active:bg-secondary"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon as={XIcon} className="size-5 text-muted-foreground" />
              </TouchableOpacity>
            </View>

            <View className="pt-4 gap-4">
              <Text className="text-xs text-muted-foreground leading-relaxed">
                Enter the user's email address or user ID. This will remove all active suspensions, restore reputation to 100 (preventing automatic midnight cron bans), unpause their recruiting apps, and send a reinstatement notification.
              </Text>

              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-foreground">User Email or ID</Text>
                <TextInput
                  value={unbanInput}
                  onChangeText={setUnbanInput}
                  placeholder="e.g. galaxysoft.connect@gmail.com"
                  placeholderTextColor="#888"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  className="bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground"
                />
              </View>

              <View className="flex-row items-center gap-2 pt-2">
                <TouchableOpacity
                  onPress={() => setShowUnbanModal(false)}
                  className="flex-1 py-3 rounded-xl border border-border items-center justify-center bg-secondary/30"
                >
                  <Text className="text-sm font-semibold text-foreground">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={isUnbanning || !unbanInput.trim()}
                  onPress={handleQuickUnban}
                  className={`flex-1 py-3 rounded-xl items-center justify-center ${
                    !unbanInput.trim() || isUnbanning ? "bg-amber-600/50" : "bg-amber-600 active:bg-amber-700"
                  }`}
                >
                  {isUnbanning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-sm font-bold text-white">Unban User</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
