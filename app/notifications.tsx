import React from 'react';
import { View, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { BellIcon, CheckCircleIcon, ArrowLeftIcon, MessageSquareIcon, InfoIcon, AlertCircleIcon } from 'lucide-react-native';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, NotificationEntity } from '@/lib/api-hooks';

export default function NotificationsScreen() {
    const router = useRouter();
    const { data: notificationsData, refetch, isFetching } = useNotifications();
    const markAllAsRead = useMarkAllNotificationsRead();
    const markAsRead = useMarkNotificationRead();

    const notifications = notificationsData?.notifications || [];
    const unreadCount = notificationsData?.unreadCount ?? 0;

    const onRefresh = React.useCallback(async () => {
        await refetch();
    }, [refetch]);

    const handleMarkAllRead = async () => {
        try {
            await markAllAsRead.mutateAsync();
        } catch (error) {
            console.error(error);
        }
    };

    const handleNotificationPress = async (notification: NotificationEntity) => {
        try {
            if (!notification.isRead) {
                await markAsRead.mutateAsync(notification.id);
            }

            if (notification.type === 'match_request') {
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
            case 'match_request': return <Icon as={InfoIcon} className="text-blue-500" />;
            case 'match_accepted': return <Icon as={CheckCircleIcon} className="text-green-500" />;
            case 'proof_update': return <Icon as={AlertCircleIcon} className="text-orange-500" />;
            case 'message': return <Icon as={MessageSquareIcon} className="text-purple-500" />;
            default: return <Icon as={BellIcon} className="text-gray-500" />;
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
                {unreadCount > 0 && (
                    <TouchableOpacity onPress={handleMarkAllRead}>
                        <Text className="text-primary font-medium">Mark all read</Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView
                className="flex-1 px-6 pt-4"
                refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
            >
                {notifications.length > 0 ? (
                    <View className="pb-10">
                        {notifications.map((notification) => (
                            <TouchableOpacity
                                key={notification.id}
                                className={`flex-row p-4 mb-3 rounded-xl border ${notification.isRead ? 'bg-card border-border' : 'bg-primary/5 border-primary/20'}`}
                                onPress={() => handleNotificationPress(notification)}
                            >
                                <View className="mr-4 mt-1">
                                    {getIcon(notification.type)}
                                </View>
                                <View className="flex-1">
                                    <Text className={`text-base ${notification.isRead ? 'font-medium' : 'font-bold'}`}>
                                        {notification.title}
                                    </Text>
                                    <Text className="text-muted-foreground text-sm mt-1 leading-relaxed">
                                        {notification.body}
                                    </Text>
                                    <Text className="text-muted-foreground/60 text-xs mt-2">
                                        {new Date(notification.createdAt).toLocaleDateString()} at {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </View>
                                {!notification.isRead && (
                                    <View className="w-2 h-2 rounded-full bg-primary mt-2" />
                                )}
                            </TouchableOpacity>
                        ))}
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
