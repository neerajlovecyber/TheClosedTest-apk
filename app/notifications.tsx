import React from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useClearAllNotifications,
  useRefreshOnFocus,
  NotificationEntity,
} from "@/lib/api-hooks";
import { ErrorState } from "@/components/ErrorState";

type TypeStyle = { icon: LucideIcon; iconClass: string };

const TYPE_STYLES: Record<string, TypeStyle> = {
  match_request: { icon: UserPlusIcon, iconClass: "text-blue-400" },
  request: { icon: UserPlusIcon, iconClass: "text-blue-400" },
  match_accepted: { icon: CheckCircleIcon, iconClass: "text-green-400" },
  acceptance: { icon: CheckCircleIcon, iconClass: "text-green-400" },
  proof_update: { icon: ClipboardCheckIcon, iconClass: "text-orange-400" },
  message: { icon: MessageSquareIcon, iconClass: "text-purple-400" },
  match_cancelled: { icon: XCircleIcon, iconClass: "text-red-400" },
};

const DEFAULT_TYPE_STYLE: TypeStyle = { icon: BellIcon, iconClass: "text-primary" };

type Row =
  | { kind: "header"; key: string; label: string }
  | { kind: "notification"; key: string; notification: NotificationEntity };

function getGroupLabel(iso: string): string {
  const date = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (date >= startOfToday) return "Today";
  if (date >= new Date(startOfToday.getTime() - 86400000)) return "Yesterday";
  if (date >= new Date(startOfToday.getTime() - 6 * 86400000)) return "This week";
  return "Earlier";
}

function stripEmojis(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  const title = stripEmojis(notification.title);
  const body = notification.body ? stripEmojis(notification.body) : "";

  return (
    <TouchableOpacity
      onPress={() => onPress(notification)}
      activeOpacity={0.7}
      className={`flex-row items-center gap-4 px-5 py-4 border-b border-border/40 active:bg-muted/70 ${isUnread ? "bg-primary/10" : "bg-transparent"}`}
    >
      <View className="w-[52px] h-[52px] rounded-2xl bg-primary/10 items-center justify-center">
        <Icon as={style.icon} size={24} className={style.iconClass} />
      </View>
      <View className="flex-1">
        <Text
          numberOfLines={2}
          className={`text-[15px] leading-snug text-foreground ${isUnread ? "font-semibold" : "font-medium"}`}
        >
          {title}
        </Text>
        {body ? (
          <Text numberOfLines={2} className="text-[13px] text-muted-foreground mt-0.5 leading-snug">
            {body}
          </Text>
        ) : null}
      </View>
      {isUnread && <View className="w-2.5 h-2.5 rounded-full bg-destructive" />}
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

  const [showClearConfirm, setShowClearConfirm] = React.useState(false);

  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = async () => {
    try {
      setShowClearConfirm(false);
      await clearAllNotifications.mutateAsync();
    } catch (error) {
      console.error("Error clearing notifications:", error);
    }
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
          <Text className="text-[17px] font-semibold text-muted-foreground px-5 pt-6 pb-3">
            {item.label}
          </Text>
        );
      }
      return <NotificationRow notification={item.notification} onPress={handleNotificationPress} />;
    },
    [handleNotificationPress],
  );

  const refreshControl = <RefreshControl refreshing={isFetching} onRefresh={onRefresh} />;

  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-2 -ml-2 mr-2 rounded-full active:bg-muted/60"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Go back"
          >
            <Icon as={ArrowLeftIcon} size={24} className="text-foreground" />
          </TouchableOpacity>
          <Text className="text-[26px] font-extrabold tracking-tight text-foreground">
            Notifications
          </Text>
          {unreadCount > 0 && (
            <View className="min-w-6 h-6 px-1.5 rounded-full bg-destructive items-center justify-center ml-2">
              <Text className="text-xs font-bold text-destructive-foreground">{unreadCount}</Text>
            </View>
          )}
        </View>
        {rows.length > 0 && (
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="p-2.5 rounded-full bg-muted/60 active:bg-primary/15 disabled:opacity-40"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Mark all as read"
            >
              <Icon as={CheckCheckIcon} size={18} className="text-foreground" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClearAll}
              className="p-2.5 rounded-full bg-muted/60 active:bg-destructive/15"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Delete all notifications"
            >
              <Icon as={Trash2Icon} size={18} className="text-destructive" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isError ? (
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
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
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
          <View className="items-center justify-center flex-1 py-24 px-8">
            <View className="w-20 h-20 rounded-3xl bg-primary/10 items-center justify-center mb-4">
              <Icon as={BellOffIcon} size={30} className="text-primary" />
            </View>
            <Text className="text-lg font-bold text-foreground">No notifications yet</Text>
            <Text className="text-muted-foreground text-sm mt-1.5 text-center leading-relaxed">
              You're all caught up. Updates about swap requests and testing proofs will show up here.
            </Text>
          </View>
        </ScrollView>
      )}

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              Your entire notification history will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setShowClearConfirm(false)}>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleConfirmClear} className="bg-destructive">
              <Text className="text-destructive-foreground font-bold">Delete</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SafeAreaView>
  );
}
