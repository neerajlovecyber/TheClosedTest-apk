import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon } from 'lucide-react-native';
import { SimpleBarChart } from '@/components/SimpleBarChart';

export default function AnalyticsScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const filter = (params.filter as 'active' | 'new' | 'all') || 'all';
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const stats = useQuery(api.admin.getStats);
    const users = useQuery(api.admin.getUsersByFilter, {
        filter,
        dateStr: selectedDate ?? undefined
    });

    const getTitle = () => {
        switch (filter) {
            case 'active': return 'Daily Active Users';
            case 'new': return 'New Users';
            case 'all': return 'All Users';
            default: return 'Users';
        }
    };

    // Prepare chart data (Last 7 days, zero-filled)
    const chartData = React.useMemo(() => {
        if (!stats) return [];

        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(d.toISOString().split('T')[0]);
        }

        return days.map(dateStr => {
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const isToday = dateStr === todayStr;

            const historyItem = stats.history?.find((h: any) => h.date === dateStr);

            let value = 0;
            if (isToday) {
                value = filter === 'active' ? (stats.dau || 0) : (stats.newUsersToday || 0);
            } else if (historyItem) {
                // If filter is 'active', use activeUsers. If 'new', use appsSubmitted (serving as a proxy for activity/newness if specific User metrics aren't in history)
                // Actually history only has: activeUsers, activeMatches, proofsUploaded, appsSubmitted, reportsCreated
                // Let's check history fields again. It lacks 'newUsers'.
                // If it's the 'new' filter, we should probably show 0 or a dash if history doesn't track it, 
                // but let's use activeUsers as a fallback for the bar heights for now if nothing else exists.
                value = filter === 'active' ? historyItem.activeUsers : (historyItem.newUsers || 0);
            }

            return {
                date: dateStr,
                value,
                label: isToday ? 'Today' : dateStr.split('-').slice(1).join('/')
            };
        });
    }, [stats, filter]);

    const formatTimeAgo = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    };

    const UserRow = ({ item, index }: any) => (
        <View className={`flex-row items-center py-3 border-b border-border/50 ${index % 2 === 0 ? 'bg-secondary/10' : ''}`}>
            <View className="w-10 h-10 rounded-full bg-muted items-center justify-center mr-3">
                <Text className="font-bold text-muted-foreground">{item.name?.[0] || 'U'}</Text>
            </View>
            <View className="flex-1">
                <Text className="font-medium text-foreground">{item.name || 'Anonymous'}</Text>
                <Text className="text-xs text-muted-foreground">{item.email || 'No email'}</Text>
            </View>
            <View className="items-end">
                <Text className="text-xs text-foreground font-medium">{formatTimeAgo(item.createdAt)}</Text>
                <View className={`px-2 py-0.5 rounded-full mt-1 ${item.isGroupMember ? 'bg-green-100 dark:bg-green-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                    <Text className={`text-[10px] font-bold ${item.isGroupMember ? 'text-green-600' : 'text-orange-600'}`}>
                        {item.isGroupMember ? 'Verified' : 'Unverified'}
                    </Text>
                </View>
            </View>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <View className="px-6 py-4 flex-row items-center border-b border-border/50">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                </TouchableOpacity>
                <View>
                    <Text className="text-xl font-bold text-foreground">{getTitle()}</Text>
                    {selectedDate && <Text className="text-xs text-primary font-medium">Filtering by: {selectedDate}</Text>}
                </View>
            </View>

            <ScrollView className="flex-1 px-4">
                {/* Chart Section */}
                {chartData.length > 0 && (filter === 'active' || filter === 'new') && (
                    <SimpleBarChart
                        data={chartData}
                        selectedDate={selectedDate}
                        onSelectDate={setSelectedDate}
                    />
                )}

                {/* Users List */}
                <Text className="text-lg font-bold mb-2 mt-4">
                    {selectedDate ? `Users on ${selectedDate}` : `All ${getTitle()}`}
                </Text>

                {users ? (
                    users.length > 0 ? (
                        users.map((user: any, index: number) => (
                            <UserRow key={user._id} item={user} index={index} />
                        ))
                    ) : (
                        <View className="py-20 items-center">
                            <Text className="text-muted-foreground">No users found for this selection.</Text>
                            {selectedDate && (
                                <TouchableOpacity onPress={() => setSelectedDate(null)} className="mt-4 bg-secondary py-2 px-4 rounded-full">
                                    <Text className="text-xs font-bold">Clear Date Filter</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )
                ) : (
                    <Text className="text-center py-10 text-muted-foreground">Loading...</Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
