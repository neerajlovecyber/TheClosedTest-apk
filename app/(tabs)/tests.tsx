import React from 'react';
import { View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { AppCard } from '@/components/AppCard';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, ClockIcon, AlertCircleIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export default function TestsScreen() {
    const router = useRouter();
    const testingApps = useQuery(api.matches.getMyActiveTests) || [];

    // Split into pending (needs attention) and completed (proof approved today)
    const pendingTasks = testingApps.filter((t: any) => t.needsAttention);
    const completedTasks = testingApps.filter((t: any) => !t.needsAttention);

    const TaskCard = ({ item, isCompleted = false }: { item: any; isCompleted?: boolean }) => (
        <TouchableOpacity
            onPress={() => router.push(`/(tabs)/match/${item.id}` as any)}
            activeOpacity={0.7}
        >
            <Card className={`mb-3 ${isCompleted ? 'opacity-70' : ''}`}>
                <CardContent className="p-3 flex-row items-center gap-3">
                    <Image
                        source={{ uri: item.iconUrl || 'https://github.com/shadcn.png' }}
                        className="w-14 h-14 rounded-xl bg-muted"
                    />
                    <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                            <Text className="font-bold text-base" numberOfLines={1}>{item.name}</Text>
                            {item.hasUnread && (
                                <View className="bg-red-500 w-3 h-3 rounded-full border-2 border-background shadow-sm" />
                            )}
                        </View>
                        <Text className="text-muted-foreground text-sm">Day {item.day} of {item.totalDays}</Text>
                        <View className="flex-row items-center mt-1 gap-2">
                            <View className="bg-secondary/50 px-2 py-0.5 rounded">
                                <Text className="text-xs text-muted-foreground">For: {item.relatedMyApp}</Text>
                            </View>
                        </View>
                    </View>
                    {isCompleted ? (
                        <View className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full">
                            <Icon as={CheckCircleIcon} className="size-5 text-green-600" />
                        </View>
                    ) : (
                        <View className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-full">
                            <Icon as={AlertCircleIcon} className="size-5 text-orange-600" />
                        </View>
                    )}
                </CardContent>
            </Card>
        </TouchableOpacity>
    );

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
                        pendingTasks.map((item: any) => (
                            <TaskCard key={item.id} item={item} isCompleted={false} />
                        ))
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

                        {completedTasks.map((item: any) => (
                            <TaskCard key={item.id} item={item} isCompleted={true} />
                        ))}
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
