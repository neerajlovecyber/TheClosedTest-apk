import React, { useMemo, useCallback, memo } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { LegendList } from '@legendapp/list';
import { AppCard } from '@/components/AppCard';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, ClockIcon, AlertCircleIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

// Memoized TaskCard component
const TaskCard = memo(({ item, onPress }: { item: any; onPress: () => void }) => {
    const isMyTaskDone = item.myProofStatus === "approved" || item.myProofStatus === "pending";
    const isPartnerTaskDone = item.partnerProofStatus === "approved";

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Card className={`mb-3 ${isMyTaskDone && isPartnerTaskDone ? 'opacity-80' : ''}`}>
                <CardContent className="p-4">
                    {/* Header: App Name & Notifications */}
                    <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-row items-center gap-3 flex-1">
                            <Image
                                source={{ uri: item.iconUrl || 'https://github.com/shadcn.png' }}
                                style={{ width: 40, height: 40, borderRadius: 12 }}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={150}
                            />
                            <View className="flex-1">
                                <View className="flex-row items-center gap-2">
                                    <Text className="font-bold text-lg leading-tight" numberOfLines={1}>{item.name}</Text>
                                    {item.hasUnread && (
                                        <View className="bg-red-500 w-2.5 h-2.5 rounded-full border border-background shadow-sm" />
                                    )}
                                </View>
                                <Text className="text-muted-foreground text-xs font-medium">Day {item.day} of {item.totalDays}</Text>
                            </View>
                        </View>

                        {item.isReviewPending && (
                            <View className="bg-orange-100 dark:bg-orange-900/40 px-3 py-1 rounded-full border border-orange-200 dark:border-orange-800">
                                <Text className="text-xs font-bold text-orange-700 dark:text-orange-400">Review Needed</Text>
                            </View>
                        )}
                    </View>

                    {/* Status Grid */}
                    <View className="flex-row gap-3">
                        {/* MY Status */}
                        <View className="flex-1 bg-secondary/30 rounded-lg p-2.5 items-center flex-row gap-3 border border-border/50">
                            <View className={`h-8 w-8 rounded-full items-center justify-center ${item.myProofStatus === 'approved' ? 'bg-green-100 dark:bg-green-900/30' :
                                item.myProofStatus === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                                    'bg-muted'
                                }`}>
                                {item.myProofStatus === 'approved' ? (
                                    <Icon as={CheckCircleIcon} className="size-4 text-green-600 dark:text-green-400" />
                                ) : item.myProofStatus === 'pending' ? (
                                    <Icon as={ClockIcon} className="size-4 text-yellow-600 dark:text-yellow-400" />
                                ) : (
                                    <Icon as={AlertCircleIcon} className="size-4 text-muted-foreground" />
                                )}
                            </View>
                            <View>
                                <Text className="text-xs text-muted-foreground font-medium uppercase tracking-wider">My Upload</Text>
                                <Text className={`text-sm font-bold ${item.myProofStatus === 'approved' ? 'text-green-600' :
                                    item.myProofStatus === 'pending' ? 'text-yellow-600' :
                                        'text-muted-foreground'
                                    }`}>
                                    {item.myProofStatus === 'approved' ? 'Done' :
                                        item.myProofStatus === 'pending' ? 'Pending' : 'Required'}
                                </Text>
                            </View>
                        </View>

                        {/* PARTNER Status */}
                        <View className="flex-1 bg-secondary/30 rounded-lg p-2.5 items-center flex-row gap-3 border border-border/50">
                            <View className={`h-8 w-8 rounded-full items-center justify-center ${item.partnerProofStatus === 'approved' ? 'bg-green-100 dark:bg-green-900/30' :
                                item.partnerProofStatus === 'pending' ? 'bg-blue-100 dark:bg-blue-900/30' :
                                    'bg-muted'
                                }`}>
                                {item.partnerProofStatus === 'approved' ? (
                                    <Icon as={CheckCircleIcon} className="size-4 text-green-600 dark:text-green-400" />
                                ) : item.partnerProofStatus === 'pending' ? (
                                    <Icon as={ClockIcon} className="size-4 text-blue-600 dark:text-blue-400" />
                                ) : (
                                    <Icon as={ClockIcon} className="size-4 text-muted-foreground opacity-50" />
                                )}
                            </View>
                            <View>
                                <Text className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Partner</Text>
                                <Text className={`text-sm font-bold ${item.partnerProofStatus === 'approved' ? 'text-green-600' :
                                    item.partnerProofStatus === 'pending' ? 'text-blue-600' :
                                        'text-muted-foreground'
                                    }`}>
                                    {item.partnerProofStatus === 'approved' ? 'Done' :
                                        item.partnerProofStatus === 'pending' ? 'Uploaded' : 'Waiting'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </CardContent>
            </Card>
        </TouchableOpacity>
    );
});

export default function TestsScreen() {
    const router = useRouter();
    const testingApps = useQuery(api.matches.getMyActiveTests) || [];

    // Memoize the split between pending and completed tasks
    const { pendingTasks, completedTasks } = useMemo(() => ({
        pendingTasks: testingApps.filter((t: any) => t.needsAttention),
        completedTasks: testingApps.filter((t: any) => !t.needsAttention)
    }), [testingApps]);

    // Memoized navigation handler
    const handleTaskPress = useCallback((taskId: string) => {
        router.push(`/(tabs)/match/${taskId}` as any);
    }, [router]);

    // Memoized render item for LegendList
    const renderTaskItem = useCallback(({ item }: { item: any }) => (
        <TaskCard
            item={item}
            onPress={() => handleTaskPress(item.id)}
        />
    ), [handleTaskPress]);

    const keyExtractor = useCallback((item: any) => item.id, []);

    return (
        <View className="flex-1 bg-background">
            {/* Header */}
            <View className="px-6 py-4 border-b border-border">
                <Text className="text-3xl font-extrabold text-foreground tracking-tight">My Tasks</Text>
                <Text className="text-sm text-muted-foreground font-medium mt-0.5">
                    {pendingTasks.length} pending • {completedTasks.length} completed today
                </Text>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
                {/* Pending Section */}
                <View className="mb-6">
                    <View className="flex-row items-center gap-2 mb-3">
                        <Icon as={ClockIcon} className="size-5 text-orange-500" />
                        <Text className="text-lg font-bold">Pending Today</Text>
                        {pendingTasks.length > 0 && (
                            <View className="bg-orange-500 px-2 py-0.5 rounded-full">
                                <Text className="text-xs text-white font-bold">{pendingTasks.length}</Text>
                            </View>
                        )}
                    </View>

                    {pendingTasks.length > 0 ? (
                        <LegendList
                            data={pendingTasks}
                            keyExtractor={keyExtractor}
                            renderItem={renderTaskItem}
                            recycleItems
                            estimatedItemSize={140}
                            scrollEnabled={false}
                        />
                    ) : (
                        <Card className="bg-green-500/10 border-green-500/30">
                            <CardContent className="p-6 items-center">
                                <Icon as={CheckCircleIcon} className="size-10 text-green-500 mb-2" />
                                <Text className="font-bold text-green-600 text-center">All Done!</Text>
                                <Text className="text-muted-foreground text-center text-sm">
                                    You've completed all your tasks for today.
                                </Text>
                            </CardContent>
                        </Card>
                    )}
                </View>

                {/* Completed Section */}
                {completedTasks.length > 0 && (
                    <View>
                        <View className="flex-row items-center gap-2 mb-3">
                            <Icon as={CheckCircleIcon} className="size-5 text-green-500" />
                            <Text className="text-lg font-bold">Completed Today</Text>
                            <View className="bg-green-500 px-2 py-0.5 rounded-full">
                                <Text className="text-xs text-white font-bold">{completedTasks.length}</Text>
                            </View>
                        </View>

                        <LegendList
                            data={completedTasks}
                            keyExtractor={keyExtractor}
                            renderItem={renderTaskItem}
                            recycleItems
                            estimatedItemSize={140}
                            scrollEnabled={false}
                        />
                    </View>
                )}

                {/* Empty State */}
                {testingApps.length === 0 && (
                    <View className="items-center justify-center py-20">
                        <Icon as={ClockIcon} className="size-16 text-muted-foreground/30 mb-4" />
                        <Text className="text-xl font-bold text-muted-foreground mb-2">No Active Tasks</Text>
                        <Text className="text-muted-foreground text-center">
                            Request a swap in the Marketplace to start testing apps!
                        </Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
