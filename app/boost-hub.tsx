import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
    RocketIcon,
    TrophyIcon,
    ArrowLeftIcon,
    TrendingUpIcon,
    SparklesIcon,
    ZapIcon,
    CrownIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useLeaderboard, useCurrentUser } from '@/lib/api-hooks';

export default function BoostHubScreen() {
    const router = useRouter();
    const { data: user } = useCurrentUser();
    const { data: leaderboardData, isLoading } = useLeaderboard(20);
    const leaderboard = leaderboardData?.leaderboard || [];

    return (
        <View className="flex-1 bg-background">
            {/* Header */}
            <View className="bg-orange-500/10 pb-6">
                <View className="px-6 pt-14 pb-2 flex-row items-center gap-4">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="w-10 h-10 rounded-full bg-background/80 items-center justify-center"
                    >
                        <Icon as={ArrowLeftIcon} className="text-foreground size-5" />
                    </TouchableOpacity>
                    <View className="flex-1 flex-row items-center gap-2">
                        <View className="w-10 h-10 rounded-full bg-orange-500 items-center justify-center">
                            <Icon as={RocketIcon} className="text-white size-5" />
                        </View>
                        <View>
                            <Text className="text-2xl font-bold text-foreground">Community Hub</Text>
                            <Text className="text-xs text-muted-foreground">Top contributors & testers</Text>
                        </View>
                    </View>
                </View>
            </View>

            <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
                {/* Your Points Display */}
                <Card className="my-4 border-orange-400/30 bg-orange-500/5">
                    <CardContent className="p-4">
                        <View className="flex-row items-center justify-between">
                            <View>
                                <Text className="text-sm text-muted-foreground">Your Reputation Score</Text>
                                <Text className="text-3xl font-bold text-orange-500">{user?.reputation ?? 50}</Text>
                            </View>
                            <View className="h-14 w-14 rounded-full bg-orange-500/20 items-center justify-center">
                                <Icon as={TrendingUpIcon} className="text-orange-500 size-7" />
                            </View>
                        </View>
                    </CardContent>
                </Card>

                {/* Leaderboard */}
                <View className="mb-8">
                    <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-row items-center gap-2">
                            <Icon as={TrophyIcon} className="text-yellow-500 size-5" />
                            <Text className="text-lg font-bold text-foreground">Leaderboard</Text>
                        </View>
                        <View className="bg-yellow-500/10 px-2 py-0.5 rounded-full">
                            <Text className="text-[10px] font-bold text-yellow-600">TOP TESTERS</Text>
                        </View>
                    </View>

                    {leaderboard.length > 0 ? (
                        <Card className="overflow-hidden border-border">
                            <CardContent className="p-0">
                                {leaderboard.map((item, index) => {
                                    const isFirst = index === 0;
                                    const rank = index + 1;

                                    return (
                                        <View
                                            key={item.id}
                                            className={`flex-row items-center gap-3 p-3.5 ${index < leaderboard.length - 1 ? 'border-b border-border/50' : ''} ${isFirst ? 'bg-yellow-500/5' : ''}`}
                                        >
                                            <View className={`w-8 h-8 rounded-lg items-center justify-center ${rank === 1 ? 'bg-yellow-500' :
                                                rank === 2 ? 'bg-gray-400' :
                                                    rank === 3 ? 'bg-orange-600' :
                                                        'bg-muted'
                                                }`}>
                                                <Text className={`font-bold text-sm ${rank <= 3 ? 'text-white' : 'text-muted-foreground'}`}>
                                                    {rank}
                                                </Text>
                                            </View>

                                            {item.avatarUrl && !item.avatarUrl.includes('shadcn.png') ? (
                                                <Image
                                                    source={{ uri: item.avatarUrl }}
                                                    style={{ width: 40, height: 40, borderRadius: 20 }}
                                                    contentFit="cover"
                                                />
                                            ) : (
                                                <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                                                    <Text className="text-sm font-bold text-primary">
                                                        {item.name?.substring(0, 2).toUpperCase() || '??'}
                                                    </Text>
                                                </View>
                                            )}

                                            <View className="flex-1">
                                                <Text className="font-semibold text-foreground text-sm" numberOfLines={1}>
                                                    {item.name || 'Anonymous Tester'}
                                                </Text>
                                                <Text className="text-xs text-muted-foreground">
                                                    {item.completedMatchesCount || 0} apps tested
                                                </Text>
                                            </View>

                                            <View className="items-end">
                                                <Text className="font-bold text-orange-500 text-lg">
                                                    {item.reputation}
                                                </Text>
                                                <Text className="text-[10px] text-muted-foreground">rep</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="border-dashed border-2 border-muted-foreground/20">
                            <CardContent className="py-8 items-center">
                                <View className="w-16 h-16 rounded-full bg-yellow-500/10 items-center justify-center mb-3">
                                    <Icon as={TrophyIcon} className="text-yellow-500/50 size-8" />
                                </View>
                                <Text className="font-semibold text-foreground mb-1">Leaderboard Loading</Text>
                                <Text className="text-sm text-muted-foreground text-center">
                                    Complete testing cycles to increase your rank!
                                </Text>
                            </CardContent>
                        </Card>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}
