import React, { useMemo, useCallback, memo, useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, ClockIcon, AlertCircleIcon, StarIcon, SearchIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/button';
import { useCurrentUser, useMatches, MatchEntity } from '@/lib/api-hooks';

// Memoized TaskCard component
const TaskCard = memo(({ item, onPress }: { item: any; onPress: () => void }) => {
    const isMyTaskDone = item.myProofStatus === 'approved' || item.myProofStatus === 'pending';
    const isPartnerTaskDone = item.partnerProofStatus === 'approved';
    const displayIconUrl = item.iconUrl || 'https://github.com/shadcn.png';

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <Card className={`mb-3 ${isMyTaskDone && isPartnerTaskDone ? 'opacity-80' : ''}`}>
                <CardContent className="p-4">
                    {/* Header: App Name & Notifications */}
                    <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-row items-center gap-3 flex-1">
                            <Image
                                source={{ uri: displayIconUrl }}
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

const getTimeUntilMidnightIST = () => {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(utcTime + istOffset);

    const nextMidnight = new Date(istTime);
    nextMidnight.setHours(24, 0, 0, 0);

    const diff = nextMidnight.getTime() - istTime.getTime();

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { hours, minutes, seconds };
};

export default function TestsScreen() {
    const router = useRouter();
    const { data: currentUser } = useCurrentUser();
    const { data: activeMatches = [] } = useMatches('active');

    // Countdown timer state
    const [timeUntilReset, setTimeUntilReset] = useState(getTimeUntilMidnightIST());

    // Update countdown every second
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeUntilReset(getTimeUntilMidnightIST());
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const testingApps = useMemo(() => {
        return activeMatches.map((m: MatchEntity) => {
            const isUser1 = m.user1Id === currentUser?.id;
            const partnerApp = isUser1 ? m.app2 : m.app1;
            const myLastProof = isUser1 ? m.user1LastProof : m.user2LastProof;
            const partnerLastProof = isUser1 ? m.user2LastProof : m.user1LastProof;

            const myProofStatus = myLastProof?.status || 'not_uploaded';
            const partnerProofStatus = partnerLastProof?.status || 'not_uploaded';
            const isReviewPending = partnerLastProof?.status === 'pending';
            const day = myLastProof?.day || 1;
            const needsAttention = isReviewPending || myProofStatus === 'not_uploaded' || myProofStatus === 'rejected';

            return {
                id: m.id,
                name: partnerApp?.title || 'Testing App',
                owner: partnerApp?.user?.name || 'Partner',
                day,
                totalDays: 14,
                iconUrl: partnerApp?.iconUrl,
                myProofStatus,
                partnerProofStatus,
                isReviewPending,
                needsAttention,
                hasUnread: false,
            };
        });
    }, [activeMatches, currentUser?.id]);

    // Memoize the split between pending and completed tasks
    const { pendingTasks, completedTasks } = useMemo(() => ({
        pendingTasks: testingApps.filter((t) => t.needsAttention),
        completedTasks: testingApps.filter((t) => !t.needsAttention),
    }), [testingApps]);

    // Navigation handler
    const handleTaskPress = useCallback((taskId: string) => {
        router.push(`/(tabs)/match/${taskId}` as any);
    }, [router]);

    // Render item for LegendList
    const renderTaskItem = useCallback(({ item }: { item: any }) => (
        <TaskCard
            item={item}
            onPress={() => handleTaskPress(item.id)}
        />
    ), [handleTaskPress]);

    const keyExtractor = useCallback((item: any) => item.id, []);

    return (
        <View className="flex-1 bg-background">
            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Header */}
                <View className="px-6 py-4">
                    <Text className="text-3xl font-extrabold text-foreground tracking-tight">My Tasks</Text>
                    {testingApps.length > 0 && (
                        <Text className="text-sm text-muted-foreground font-medium mt-0.5">
                            {pendingTasks.length} pending • {completedTasks.length} completed today
                        </Text>
                    )}
                </View>

                {/* Daily Reset Countdown Card */}
                <View className="px-4 mb-4">
                    <Card className="border-orange-400/30 bg-orange-500/5">
                        <CardContent className="p-3 py-2">
                            <View className="flex-row items-center justify-between gap-2">
                                <View className="flex-row items-center gap-2 flex-1">
                                    <Icon as={ClockIcon} className="text-orange-500 size-5" />
                                    <View>
                                        <Text className="text-sm font-bold text-foreground">Time Until Reset</Text>
                                        <Text className="text-xs text-muted-foreground" numberOfLines={1} adjustsFontSizeToFit>Resets at 12:00 AM IST</Text>
                                    </View>
                                </View>
                                <View className="flex-row items-center gap-2">
                                    <View className="items-center border border-orange-200 dark:border-orange-800 bg-background px-3 py-2 rounded-lg min-w-[50px]">
                                        <Text className="text-2xl font-bold text-orange-500">{timeUntilReset.hours.toString().padStart(2, '0')}</Text>
                                        <Text className="text-[10px] text-muted-foreground font-medium tracking-wide">HRS</Text>
                                    </View>
                                    <View className="pb-2">
                                        <Text className="text-xl font-bold text-orange-400">:</Text>
                                    </View>
                                    <View className="items-center border border-orange-200 dark:border-orange-800 bg-background px-3 py-2 rounded-lg min-w-[50px]">
                                        <Text className="text-2xl font-bold text-orange-500">{timeUntilReset.minutes.toString().padStart(2, '0')}</Text>
                                        <Text className="text-[10px] text-muted-foreground font-medium tracking-wide">MIN</Text>
                                    </View>
                                </View>
                            </View>
                        </CardContent>
                    </Card>
                </View>

                <View className="px-4 pt-1">
                    {/* Pending Section */}
                    {pendingTasks.length > 0 && (
                        <View className="mb-6">
                            <View className="flex-row items-center gap-2 mb-3">
                                <Icon as={ClockIcon} className="size-5 text-orange-500" />
                                <Text className="text-lg font-bold">Pending Today</Text>
                                <View className="bg-orange-500 px-2 py-0.5 rounded-full">
                                    <Text className="text-xs text-white font-bold">{pendingTasks.length}</Text>
                                </View>
                            </View>

                            <View className="gap-0">
                                {pendingTasks.map((item) => (
                                    <React.Fragment key={keyExtractor(item)}>
                                        {renderTaskItem({ item })}
                                    </React.Fragment>
                                ))}
                            </View>
                        </View>
                    )}

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

                            <View className="gap-0">
                                {completedTasks.map((item) => (
                                    <React.Fragment key={keyExtractor(item)}>
                                        {renderTaskItem({ item })}
                                    </React.Fragment>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Empty State */}
                    {testingApps.length === 0 && (
                        <View className="items-center justify-center pb-12 px-6">
                            <View className="bg-gradient-to-br from-primary/10 to-purple-500/10 rounded-full p-8 mb-6">
                                <Icon as={ClockIcon} className="size-20 text-primary" />
                            </View>

                            <Text className="text-2xl font-extrabold text-foreground mb-3 text-center">
                                Ready to Start Testing?
                            </Text>

                            <Text className="text-muted-foreground text-center text-base mb-8 max-w-sm leading-relaxed">
                                Browse the marketplace and request a swap to begin your 14-day testing journey!
                            </Text>

                            <View className="w-full gap-3 mb-8">
                                <Card className="bg-blue-500/10 border-blue-500/30">
                                    <CardContent className="p-4 flex-row items-center gap-3">
                                        <View className="bg-blue-500 rounded-full p-2">
                                            <Icon as={CheckCircleIcon} className="size-5 text-white" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-blue-600 dark:text-blue-400">Get Real Feedback</Text>
                                            <Text className="text-xs text-muted-foreground">Daily proof reviews from testers</Text>
                                        </View>
                                    </CardContent>
                                </Card>

                                <Card className="bg-green-500/10 border-green-500/30">
                                    <CardContent className="p-4 flex-row items-center gap-3">
                                        <View className="bg-green-500 rounded-full p-2">
                                            <Icon as={StarIcon} className="size-5 text-white" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-green-600 dark:text-green-400">Build Reputation</Text>
                                            <Text className="text-xs text-muted-foreground">Earn points for quality testing</Text>
                                        </View>
                                    </CardContent>
                                </Card>
                            </View>

                            <Button
                                onPress={() => router.push('/(tabs)/marketplace' as any)}
                                className="w-full rounded-2xl h-14 shadow-lg shadow-primary/30"
                            >
                                <Icon as={SearchIcon} className="text-primary-foreground size-5 mr-2" />
                                <Text className="text-primary-foreground font-bold text-base">Browse Marketplace</Text>
                            </Button>
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}
