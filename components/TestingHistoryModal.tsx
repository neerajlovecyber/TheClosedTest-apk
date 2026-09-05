import React, { useMemo } from "react";
import {
  View,
  Modal,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  XIcon,
  CheckCircle2Icon,
  SparklesIcon,
  CalendarIcon,
  HistoryIcon,
} from "lucide-react-native";
import { useCurrentUser, useMyApps, useMatches, MatchEntity } from "@/lib/api-hooks";

interface TestingHistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TestingHistoryModal({ visible, onClose }: TestingHistoryModalProps) {
  const insets = useSafeAreaInsets();
  const { data: currentUser } = useCurrentUser();
  const { data: myApps = [] } = useMyApps();
  const { data: matches = [], isLoading, isRefetching, refetch } = useMatches("completed");

  const myAppIds = useMemo(() => myApps.map((a) => a.id), [myApps]);

  const completedList = useMemo(() => {
    return matches.map((m: MatchEntity) => {
      const isUser1 =
        typeof m.isUser1 === "boolean"
          ? m.isUser1
          : myAppIds.includes(m.app1Id)
            ? true
            : myAppIds.includes(m.app2Id)
              ? false
              : currentUser?.id
                ? m.user1Id === currentUser.id
                : true;

      const partnerApp = m.partnerApp || (isUser1 ? m.app2 : m.app1);
      const partnerUser = m.partnerUser || (isUser1 ? m.user2 : m.user1);
      const myApp = m.myApp || (isUser1 ? m.app1 : m.app2);

      const formatDate = (d?: string | Date | null) => {
        if (!d) return null;
        return new Date(d).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      };

      const startDateFormatted = formatDate(m.startDate || m.createdAt);
      const endDateFormatted = formatDate(m.completedAt || m.updatedAt);
      const dateRange =
        startDateFormatted && endDateFormatted
          ? `${startDateFormatted} – ${endDateFormatted}`
          : endDateFormatted || "Completed";

      return {
        id: m.id,
        appName: partnerApp?.title || "Testing App",
        appIcon: partnerApp?.iconUrl || "https://github.com/shadcn.png",
        myAppName: myApp?.title,
        partnerName: partnerUser?.name || "Peer Tester",
        dateRange,
        status: m.status,
      };
    });
  }, [matches, currentUser?.id, myAppIds]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      statusBarTranslucent
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-background"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {/* Header */}
        <View className="px-5 py-4 border-b border-border flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5">
            <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
              <Icon as={HistoryIcon} className="size-5 text-primary" />
            </View>
            <View>
              <Text className="text-xl font-bold text-foreground">Testing History</Text>
              <Text className="text-xs text-muted-foreground">
                Completed & verified peer tests
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={onClose}
            className="w-9 h-9 rounded-full bg-secondary items-center justify-center active:opacity-70"
            accessibilityLabel="Close"
          >
            <Icon as={XIcon} className="size-5 text-foreground" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center p-6">
            <ActivityIndicator size="large" color="#f97316" />
            <Text className="text-sm text-muted-foreground mt-3">Loading history...</Text>
          </View>
        ) : completedList.length === 0 ? (
          <View className="flex-1 items-center justify-center p-8">
            <View className="w-16 h-16 rounded-full bg-muted items-center justify-center mb-4">
              <Icon as={HistoryIcon} className="size-8 text-muted-foreground" />
            </View>
            <Text className="text-lg font-bold text-foreground text-center">
              No Completed Tests Yet
            </Text>
            <Text className="text-sm text-muted-foreground text-center mt-1.5 max-w-[280px]">
              Once you finish a 14-day peer test, your completed apps and reputation rewards will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={completedList}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={["#f97316"]}
                tintColor="#f97316"
              />
            }
            ListHeaderComponent={
              <View className="mb-3 px-1">
                <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Completed Tests ({completedList.length})
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Card className="mb-3 p-4 bg-card border border-border rounded-xl">
                <View className="flex-col gap-3">
                  {/* Top Row: App Icon + App Info + Completed Pill */}
                  <View className="flex-row items-center gap-3">
                    <Image
                      source={{ uri: item.appIcon }}
                      style={{ width: 44, height: 44, borderRadius: 12 }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={150}
                    />
                    <View className="flex-1">
                      <Text className="font-bold text-base text-foreground leading-tight" numberOfLines={1}>
                        {item.appName}
                      </Text>
                      <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                        Partner: {item.partnerName}
                      </Text>
                    </View>
                    <View className="bg-green-500/10 dark:bg-green-950/40 border border-green-500/30 px-2.5 py-1 rounded-full flex-row items-center gap-1">
                      <Icon as={CheckCircle2Icon} className="size-3.5 text-green-600 dark:text-green-400" />
                      <Text className="text-[11px] font-bold text-green-600 dark:text-green-400">
                        Completed
                      </Text>
                    </View>
                  </View>

                  {/* Divider */}
                  <View className="h-[1px] bg-border/60" />

                  {/* Bottom Row: Starting to Ending Date Range & Reward */}
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="flex-row items-center gap-1.5 flex-1 mr-2">
                      <Icon as={CalendarIcon} className="size-3.5 text-muted-foreground shrink-0" />
                      <Text className="text-xs text-muted-foreground font-medium shrink" numberOfLines={1}>
                        {item.dateRange}
                      </Text>
                    </View>

                    <View className="bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-md flex-row items-center gap-1 shrink-0">
                      <Icon as={SparklesIcon} className="size-3 text-amber-500" />
                      <Text className="text-xs font-bold text-amber-600 dark:text-amber-400">
                        +20 Rep
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>
            )}
          />
        )}
      </View>
    </Modal>
  );
}
