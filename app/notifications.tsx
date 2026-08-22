import React from 'react';
import { View, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import {
    BellIcon,
    CheckCircleIcon,
    ArrowLeftIcon,
    MessageSquareIcon,
    InfoIcon,
    AlertCircleIcon,
    CheckCheckIcon,
    Trash2Icon,
} from 'lucide-react-native';
import {
    useNotifications,
    useMarkNotificationRead,
    useMarkAllNotificationsRead,
    useClearAllNotifications,
    useRefreshOnFocus,
    NotificationEntity,
} from '@/lib/api-hooks';

export default function NotificationsScreen() {
    const router = useRouter();
    const { data: notificationsData, refetch, isFetching } = useNotifications();
    const markAllAsRead = useMarkAllNotificationsRead();
    const markAsRead = useMarkNotificationRead();
    const clearAllNotifications = useClearAllNotifications();

    // Instant refresh when opening notifications
    useRefreshOnFocus(
        React.useCallback(async () => {
            await refetch();
        }, [refetch])
    );

    const notifications = notificationsData?.notifications || [];
    const unreadCount = notificationsData?.unreadCount ?? 0;

    const onRefresh = React.useCallback(async () => {
        await refetch();
    }, [refetch]);

    const handleMarkAllRead = async () => {
        try {
            await markAllAsRead.mutateAsync();
        } catch (error) {
            console.error('Error marking all read:', error);
        }
    };

    const handleClearAll = async () => {
        try {
            await clearAllNotifications.mutateAsync();
        } catch (error) {
            console.error('Error clearing notifications:', error);
        }
    };

    const handleNotificationPress = async (notification: NotificationEntity) => {
        try {
            if (!notification.isRead) {
                await markAsRead.mutateAsync(notification.id);
            }

            if (notification.type === 'match_request' || notification.type === 'request') {
                router.push('/(tabs)');
                return;
            }

            const data = notification.data as Record<string, unknown> | undefined;
            if (data?.matchId) {
                router.push({ pathname: '/(tabs)/match/[id]', params: { id: String(data.matchId) } });
            }
        } catch (error) {
            console.error('Error handling notification press:', error);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'match_request':
            case 'request':
                return <Icon as={InfoIcon} className="text-blue-500" />;
            case 'match_accepted':
            case 'acceptance':
                return <Icon as={CheckCircleIcon} className="text-green-500" />;
            case 'proof_update':
                return <Icon as={AlertCircleIcon} className="text-orange-500" />;
            case 'message':
                return <Icon as={MessageSquareIcon} className="text-purple-500" />;
            case 'match_cancelled':
                return <Icon as={AlertCircleIcon} className="text-red-500" />;
            default:
                return <Icon as={BellIcon} className="text-gray-500" />;
        }
    };

    return (
        <View className="flex-1 bg-background">
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View className="px-6 pt-12 pb-4 flex-row items-center justify-between border-b border-border">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => router.back()} className="mr-4">
                        <Icon as={ArrowLeftIcon} className="text-foreground" />
                    </TouchableOpacity>
                    <Text className="text-2xl font-bold">Notifications</Text>
                </View>
                {notifications.length > 0 && (
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

            <ScrollView
                className="flex-1 px-6 pt-4"
                refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
            >
                {notifications.length > 0 ? (
                    <View className="pb-10">
                        {notifications.map((notification) => {
                            const isUnread = !notification.isRead;
                            return (
                                <TouchableOpacity
                                    key={notification.id}
                                    className={`flex-row p-4 mb-3 rounded-xl border items-start ${isUnread ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}
                                    onPress={() => handleNotificationPress(notification)}
                                    activeOpacity={0.7}
                                >
                                    <View className="mr-3.5 mt-0.5">
                                        {getIcon(notification.type)}
                                    </View>
                                    <View className="flex-1">
                                        <View className="flex-row items-center gap-2">
                                            <Text className={`text-base flex-1 ${isUnread ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>
                                                {notification.title}
                                            </Text>
                                            {isUnread && (
                                                <View className="w-2.5 h-2.5 rounded-full bg-primary" />
                                            )}
                                        </View>
                                        <Text className="text-muted-foreground text-sm mt-1 leading-relaxed">
                                            {notification.body}
                                        </Text>
                                        <Text className="text-muted-foreground/60 text-xs mt-2">
                                            {new Date(notification.createdAt).toLocaleDateString()} at {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : (
                    <View className="items-center justify-center py-20">
                        <Icon as={BellIcon} className="text-muted-foreground/30 size-16 mb-4" />
                        <Text className="text-muted-foreground font-medium text-lg">No notifications yet</Text>
                        <Text className="text-muted-foreground/60 text-sm mt-1 text-center">
                            You will receive updates when developers request swaps or review your testing proofs.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
