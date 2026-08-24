import React from "react";
import { Alert, RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import type { LucideIcon } from "lucide-react-native";
import {
  ArrowLeftIcon,
  BellIcon,
  BellOffIcon,
  CheckCheckIcon,
  CheckCircleIcon,
  ClipboardCheckIcon,
  MessageSquareIcon,
  Trash2Icon,
  UserPlusIcon,
  XCircleIcon,
} from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useClearAllNotifications,
  useRefreshOnFocus,
  NotificationEntity,
} from "@/lib/api-hooks";
import { ErrorState } from "@/components/ErrorState";

type TypeStyle = { icon: LucideIcon; badgeClass: string; iconClass: string };

const TYPE_STYLES: Record<string, TypeStyle> = {
  match_request: { icon: UserPlusIcon, badgeClass: "bg-blue-500/10", iconClass: "text-blue-500" },
  request: { icon: UserPlusIcon, badgeClass: "bg-blue-500/10", iconClass: "text-blue-500" },
  match_accepted: { icon: CheckCircleIcon, badgeClass: "bg-green-500/10", iconClass: "text-green-500" },
  acceptance: { icon: CheckCircleIcon, badgeClass: "bg-green-500/10", iconClass: "text-green-500" },
  proof_update: { icon: ClipboardCheckIcon, badgeClass: "bg-orange-500/10", iconClass: "text-orange-500" },
  message: { icon: MessageSquareIcon, badgeClass: "bg-purple-500/10", iconClass: "text-purple-500" },
  match_cancelled: { icon: XCircleIcon, badgeClass: "bg-red-500/10", iconClass: "text-red-500" },
};

const DEFAULT_TYPE_STYLE: TypeStyle = {
  icon: BellIcon,
  badgeClass: "bg-muted",
  iconClass: "text-muted-foreground",
};

type Row =
  | { kind: "header"; key: string; label: string }
  | { kind: "notification"; key: string; notification: NotificationEntity };

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function getGroupLabel(iso: string): string {
  const date = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (date >= startOfToday) return "Today";
  if (date >= new Date(startOfToday.getTime() - 86400000)) return "Yesterday";
  if (date >= new Date(startOfToday.getTime() - 7 * 86400000)) return "Previous 7 days";
  return "Earlier";
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: NotificationEntity;
  onPress: (notification: NotificationEntity) => void;
}) {
  const isUnread = !notification.isRead;
  const style = TYPE_STYLES[notification.type] ?? DEFAULT_TYPE_STYLE;

  return (
    <TouchableOpacity
      onPress={() => onPress(notification)}
      activeOpacity={0.7}
      className={`flex-row items-start p-4 mb-2.5 rounded-2xl border ${isUnread ? "bg-primary/5 border-primary/25" : "bg-card border-border"}`}
    >
      <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${style.badgeClass}`}>
        <Icon as={style.icon} size={18} className={style.iconClass} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-start">
          <Text
            numberOfLines={2}
            className={`flex-1 text-[15px] leading-snug ${isUnread ? "font-bold text-foreground" : "font-medium text-foreground/80"}`}
          >
            {notification.title}
          </Text>
          <Text className="text-xs text-muted-foreground/70 ml-2 mt-0.5">
            {formatRelativeTime(notification.createdAt)}
          </Text>
        </View>
        <Text numberOfLines={2} className="text-sm text-muted-foreground mt-1 leading-snug">
          {notification.body}
        </Text>
        {isUnread && (
          <View className="flex-row items-center gap-1.5 mt-2">
            <View className="w-1.5 h-1.5 rounded-full bg-primary" />
            <Text className="text-[11px] font-medium text-primary">New</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { data: notificationsData, refetch, isFetching, isError } = useNotifications();
  const markAllAsRead = useMarkAllNotificationsRead();
  const markAsRead = useMarkNotificationRead();
  const clearAllNotifications = useClearAllNotifications();

  // Instant refresh when opening notifications
  useRefreshOnFocus(
    React.useCallback(async () => {
      await refetch();
    }, [refetch]),
  );

  const notifications = notificationsData?.notifications || [];
  const unreadCount = notificationsData?.unreadCount ?? 0;

  const rows = React.useMemo<Row[]>(() => {
    const sorted = [...notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const result: Row[] = [];
    let lastLabel = "";
    for (const notification of sorted) {
      const label = getGroupLabel(notification.createdAt);
      if (label !== lastLabel) {
        result.push({ kind: "header", key: `header-${label}`, label });
        lastLabel = label;
      }
      result.push({ kind: "notification", key: notification.id, notification });
    }
    return result;
  }, [notifications]);

  const onRefresh = React.useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead.mutateAsync();
    } catch (error) {
      console.error("Error marking all read:", error);
    }
  };

  const handleClearAll = () => {
    Alert.alert("Delete all notifications?", "Your entire notification history will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          clearAllNotifications.mutateAsync().catch((error) => {
            console.error("Error clearing notifications:", error);
          });
        },
      },
    ]);
  };

  const handleNotificationPress = React.useCallback(
    async (notification: NotificationEntity) => {
      try {
        if (!notification.isRead) {
          await markAsRead.mutateAsync(notification.id);
        }

        if (notification.type === "match_request" || notification.type === "request") {
          router.push("/(tabs)");
          return;
        }

        const data = notification.data as Record<string, unknown> | undefined;
        if (data?.matchId) {
          router.push({ pathname: "/(tabs)/match/[id]", params: { id: String(data.matchId) } });
        }
      } catch (error) {
        console.error("Error handling notification press:", error);
      }
    },
    [markAsRead, router],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "header") {
        return (
          <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 mt-1">
            {item.label}
          </Text>
        );
      }
      return <NotificationRow notification={item.notification} onPress={handleNotificationPress} />;
    },
    [handleNotificationPress],
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-6 pt-2 pb-4 flex-row items-center justify-between border-b border-border">
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-2 -ml-2 mr-3 rounded-full bg-muted/60 active:bg-muted"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Go back"
          >
            <Icon as={ArrowLeftIcon} size={20} className="text-foreground" />
          </TouchableOpacity>
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-2xl font-bold">Notifications</Text>
              {unreadCount > 0 && (
                <View className="px-2 py-0.5 rounded-full bg-primary">
                  <Text className="text-xs font-semibold text-primary-foreground">{unreadCount}</Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-muted-foreground mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}`
                : "You're all caught up"}
            </Text>
          </View>
        </View>
        {rows.length > 0 && (
          <View className="flex-row items-center gap-2">
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={handleMarkAllRead}
                className="p-2 rounded-xl bg-primary/10 active:bg-primary/20"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Mark all as read"
              >
                <Icon as={CheckCheckIcon} className="size-5 text-primary" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleClearAll}
              className="p-2 rounded-xl bg-muted/60 active:bg-destructive/10"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Delete all notifications"
            >
              <Icon as={Trash2Icon} className="size-5 text-muted-foreground" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isError ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <ErrorState
            title="Couldn't load notifications"
            message="We couldn't reach the server. Pull down or tap retry once you're back online."
            onRetry={() => refetch()}
            isRetrying={isFetching}
          />
        </ScrollView>
      ) : rows.length > 0 ? (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center justify-center py-24 px-8">
            <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-4">
              <Icon as={BellOffIcon} size={30} className="text-primary" />
            </View>
            <Text className="text-lg font-bold">No notifications yet</Text>
            <Text className="text-muted-foreground text-sm mt-1.5 text-center leading-relaxed">
              You're all caught up. Updates about swap requests and testing proofs will show up here.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
