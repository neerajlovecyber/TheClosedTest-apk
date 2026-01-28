import React, { useEffect } from 'react';
import { View, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { BellIcon, CheckCircleIcon, ArrowLeftIcon, MessageSquareIcon, InfoIcon, AlertCircleIcon } from 'lucide-react-native';
import { Button } from '@/components/ui/button';

import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';
import { useInvalidateQueries } from '@/hooks/useInvalidateQueries';

export default function NotificationsScreen() {
    const router = useRouter();
    const { data: notifications = [] } = useCachedConvexQuery(['notifications'], api.notifications.getMyNotifications);
    const markAllAsRead = useMutation(api.notifications.markAllAsRead);
    const markAsRead = useMutation(api.notifications.markAsRead);
    const { invalidateNotifications } = useInvalidateQueries();

    const [refreshing, setRefreshing] = React.useState(false);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        // Convex queries are reactive, but we can force cache invalidation to be sure
        invalidateNotifications();
        setTimeout(() => setRefreshing(false), 1000);
    }, [invalidateNotifications]);

    const handleMarkAllRead = async () => {
        try {
            await markAllAsRead();
            invalidateNotifications();
        } catch (error) {
            console.error(error);
        }
    };

    const handleNotificationPress = async (notification: any) => {
        try {
            if (!notification.read) {
                await markAsRead({ notificationId: notification._id });
                invalidateNotifications();
            }

            // Handle navigation based on type
            if (notification.type === 'match_request') {
                router.push('/(tabs)');
                return;
            }

            if (notification.data?.matchId) {
                router.push({ pathname: '/(tabs)/match/[id]', params: { id: notification.data.matchId } });
            }
        } catch (error) {
            console.error("Error handling notification press:", error);
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
                {notifications.some((n: any) => !n.read) && (
                    <TouchableOpacity onPress={handleMarkAllRead}>
                        <Text className="text-primary font-medium">Mark all read</Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView
                className="flex-1 px-6 pt-4"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {notifications.length > 0 ? (
                    <View className="pb-10">
                        {notifications.map((notification: any) => (
                            <TouchableOpacity
                                key={notification._id}
                                className={`flex-row p-4 mb-3 rounded-xl border ${notification.read ? 'bg-card border-border' : 'bg-primary/5 border-primary/20'}`}
                                onPress={() => handleNotificationPress(notification)}
                            >
                                <View className="mr-4 mt-1">
                                    {getIcon(notification.type)}
                                </View>
                                <View className="flex-1">
                                    <Text className={`font-semibold mb-1 ${notification.read ? 'text-foreground' : 'text-primary'}`}>
                                        {notification.title}
                                    </Text>
                                    <Text className="text-muted-foreground text-sm">
                                        {notification.body}
                                    </Text>
                                    <Text className="text-[10px] text-muted-foreground/50 mt-2 text-right">
                                        {new Date(notification.createdAt).toLocaleDateString()}
                                    </Text>
                                </View>
                                {!notification.read && (
                                    <View className="w-2 h-2 bg-primary rounded-full ml-2 mt-2" />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : (
                    <View className="flex-1 items-center justify-center py-20 opacity-50">
                        <Icon as={BellIcon} className="size-16 text-muted-foreground mb-4" />
                        <Text className="text-lg font-medium text-muted-foreground">No notifications yet</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
