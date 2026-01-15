import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
    RocketIcon,
    ClockIcon,
    TrophyIcon,
    PlayCircleIcon,
    ArrowLeftIcon,
    TrendingUpIcon,
    SparklesIcon,
    ZapIcon,
    CrownIcon,
    CheckCircleIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';
import { useRewardedAd } from '@/hooks/useRewardedAd';
import { toast } from '@/lib/sonner';
import { Image } from 'expo-image';
import { Id } from '@/convex/_generated/dataModel';

import { TestIds } from 'react-native-google-mobile-ads';

// Ad Unit ID for Boost feature
const BOOST_AD_UNIT_ID = __DEV__
    ? TestIds.REWARDED // Use library's test ID
    : 'ca-app-pub-3238435978294704/6838839038'; // Production ID for boost rewards

export default function BoostHubScreen() {
    const router = useRouter();
    const { data: boostStatus } = useCachedConvexQuery(['boostStatus'], api.boost.getBoostStatus);
    const boostApp = useMutation(api.boost.boostApp);
    const initBoostCycle = useMutation(api.boost.initBoostCycle);
    const { loaded: adLoaded, loading: adLoading, showAd } = useRewardedAd(BOOST_AD_UNIT_ID);

    const [boosting, setBoosting] = useState(false);
    const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number>(0);
    const [cycleInitialized, setCycleInitialized] = useState(false);

    // Initialize boost cycle on mount (creates cycle if doesn't exist)
    useEffect(() => {
        if (!cycleInitialized) {
            initBoostCycle().then(() => {
                setCycleInitialized(true);
            }).catch(console.error);
        }
    }, []);

    // Auto-select first app when data loads
    useEffect(() => {
        if (boostStatus?.myApps && boostStatus.myApps.length > 0 && !selectedAppId) {
            setSelectedAppId(boostStatus.myApps[0]._id);
        }
    }, [boostStatus?.myApps]);

    // Update countdown timer every second
    useEffect(() => {
        if (boostStatus?.cycleEnd) {
            const updateTimer = () => {
                const remaining = Math.max(0, boostStatus.cycleEnd - Date.now());
                setTimeRemaining(remaining);
            };

            updateTimer();
            const interval = setInterval(updateTimer, 1000);
            return () => clearInterval(interval);
        }
    }, [boostStatus?.cycleEnd]);

    // Format time remaining
    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return { hours, minutes, seconds };
    };

    const time = formatTime(timeRemaining);

    const handleBoost = async () => {
        if (!selectedAppId) {
            toast.info('Select an App', { description: 'Please select an app to boost first.' });
            return;
        }

        if (Platform.OS === 'web') {
            toast.info('Ads Not Available', { description: 'Rewarded ads are only available on mobile devices.' });
            return;
        }

        if (!adLoaded) {
            toast.info('Ad Loading', { description: 'Please wait while the ad loads...' });
            return;
        }

        setBoosting(true);
        try {
            const rewarded = await showAd();
            if (rewarded) {
                const result = await boostApp({ appId: selectedAppId as Id<"apps"> });
                const appName = boostStatus?.myApps?.find((a: any) => a._id === selectedAppId)?.title || 'App';
                toast.success('Boosted! 🚀', {
                    description: `${appName} +${result.pointsEarned} point! Total: ${result.newScore}`,
                });
            }
        } catch (error: any) {
            console.error('Boost failed:', error);
            toast.error('Boost Failed', { description: error.message || 'Please try again.' });
        } finally {
            setBoosting(false);
        }
    };

    const getMedalEmoji = (rank: number) => {
        switch (rank) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return `#${rank}`;
        }
    };

    const getRankColor = (rank: number) => {
        switch (rank) {
            case 1: return 'bg-yellow-500/20 border-yellow-500/50';
            case 2: return 'bg-gray-300/20 border-gray-400/50';
            case 3: return 'bg-orange-600/20 border-orange-600/50';
            default: return 'bg-muted/30 border-border';
        }
    };

    const selectedApp = boostStatus?.myApps?.find((a: any) => a._id === selectedAppId);

    return (
        <View className="flex-1 bg-background">
            {/* Header with gradient effect */}
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
                            <Text className="text-2xl font-bold text-foreground">Boost Hub</Text>
                            <Text className="text-xs text-muted-foreground">Get featured in the marketplace</Text>
                        </View>
                    </View>
                </View>

                {/* Countdown Timer - Hero Style */}
                <View className="mx-6 mt-2 p-4 rounded-2xl bg-background border border-orange-400/30 shadow-lg">
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2">
                            <Icon as={ClockIcon} className="text-orange-500 size-5" />
                            <Text className="text-sm font-medium text-muted-foreground">Next Reset</Text>
                        </View>
                        <View className="bg-orange-500/10 px-2 py-0.5 rounded-full">
                            <Text className="text-[10px] font-bold text-orange-500">48H CYCLE</Text>
                        </View>
                    </View>
                    <View className="flex-row justify-center gap-3 mt-3">
                        <View className="items-center">
                            <View className="w-16 h-16 rounded-xl bg-orange-500/10 items-center justify-center">
                                <Text className="text-2xl font-bold text-orange-500">{time.hours.toString().padStart(2, '0')}</Text>
                            </View>
                            <Text className="text-[10px] text-muted-foreground mt-1">HOURS</Text>
                        </View>
                        <Text className="text-2xl font-bold text-orange-500 mt-4">:</Text>
                        <View className="items-center">
                            <View className="w-16 h-16 rounded-xl bg-orange-500/10 items-center justify-center">
                                <Text className="text-2xl font-bold text-orange-500">{time.minutes.toString().padStart(2, '0')}</Text>
                            </View>
                            <Text className="text-[10px] text-muted-foreground mt-1">MINS</Text>
                        </View>
                        <Text className="text-2xl font-bold text-orange-500 mt-4">:</Text>
                        <View className="items-center">
                            <View className="w-16 h-16 rounded-xl bg-orange-500/10 items-center justify-center">
                                <Text className="text-2xl font-bold text-orange-500">{time.seconds.toString().padStart(2, '0')}</Text>
                            </View>
                            <Text className="text-[10px] text-muted-foreground mt-1">SECS</Text>
                        </View>
                    </View>
                </View>
            </View>

            <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
                {/* How It Works - Compact Pills */}
                <View className="flex-row flex-wrap gap-2 my-4">
                    <View className="flex-row items-center gap-1.5 bg-green-500/10 px-3 py-1.5 rounded-full">
                        <Icon as={PlayCircleIcon} className="size-3.5 text-green-600" />
                        <Text className="text-xs font-medium text-green-600">Watch Ad = +1 pt</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5 bg-purple-500/10 px-3 py-1.5 rounded-full">
                        <Icon as={CrownIcon} className="size-3.5 text-purple-600" />
                        <Text className="text-xs font-medium text-purple-600">Top 5 = Featured</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5 bg-blue-500/10 px-3 py-1.5 rounded-full">
                        <Icon as={ZapIcon} className="size-3.5 text-blue-600" />
                        <Text className="text-xs font-medium text-blue-600">Resets Every 48h</Text>
                    </View>
                </View>

                {/* My Apps Section - SELECT WHICH APP TO BOOST */}
                {boostStatus?.myApps && boostStatus.myApps.length > 0 && (
                    <View className="mb-4">
                        <View className="flex-row items-center gap-2 mb-3">
                            <Icon as={RocketIcon} className="text-primary size-5" />
                            <Text className="text-lg font-bold text-foreground">Select App to Boost</Text>
                        </View>

                        <View className="gap-2">
                            {boostStatus.myApps.map((app: any) => {
                                const isSelected = selectedAppId === app._id;
                                return (
                                    <TouchableOpacity
                                        key={app._id}
                                        onPress={() => setSelectedAppId(app._id)}
                                        activeOpacity={0.7}
                                    >
                                        <View className={`flex-row items-center gap-3 p-3 rounded-xl border-2 transition-all ${isSelected
                                            ? 'border-orange-500 bg-orange-500/10'
                                            : 'border-border bg-card'
                                            }`}>
                                            {/* Selection indicator */}
                                            <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${isSelected ? 'border-orange-500 bg-orange-500' : 'border-muted-foreground/30'
                                                }`}>
                                                {isSelected && (
                                                    <Icon as={CheckCircleIcon} className="size-4 text-white" />
                                                )}
                                            </View>

                                            <Image
                                                source={{ uri: app.iconUrl }}
                                                style={{ width: 48, height: 48, borderRadius: 10 }}
                                                contentFit="cover"
                                            />
                                            <View className="flex-1">
                                                <Text className="font-semibold text-foreground" numberOfLines={1}>
                                                    {app.title}
                                                </Text>
                                                <View className="flex-row items-center gap-2 mt-1">
                                                    <View className="flex-row items-center gap-1 bg-orange-500/10 px-2 py-0.5 rounded">
                                                        <Icon as={TrendingUpIcon} className="size-3 text-orange-500" />
                                                        <Text className="text-xs font-bold text-orange-500">
                                                            {app.boostScore} pts
                                                        </Text>
                                                    </View>
                                                    {app.rank && app.rank <= 5 && (
                                                        <View className="bg-green-500/10 px-2 py-0.5 rounded">
                                                            <Text className="text-[10px] font-bold text-green-600">
                                                                🏆 #{app.rank}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Main CTA Button */}
                        <TouchableOpacity
                            onPress={handleBoost}
                            disabled={boosting || adLoading || !selectedAppId}
                            activeOpacity={0.8}
                            className="w-full py-4 rounded-2xl bg-orange-500 items-center justify-center mt-4"
                            style={{
                                opacity: boosting || adLoading || !selectedAppId ? 0.6 : 1,
                                shadowColor: '#f97316',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.3,
                                shadowRadius: 8,
                                elevation: 8,
                            }}
                        >
                            <View className="flex-row items-center gap-2">
                                <Icon as={PlayCircleIcon} className="text-white size-6" />
                                <Text className="text-white font-bold text-lg">
                                    {adLoading ? 'Loading...' : boosting ? 'Boosting...' : 'WATCH AD & BOOST +1'}
                                </Text>
                            </View>
                        </TouchableOpacity>
                        {selectedApp && (
                            <Text className="text-xs text-muted-foreground text-center mt-2">
                                Boosting: {selectedApp.title}
                            </Text>
                        )}
                    </View>
                )}

                {/* No Apps State */}
                {(!boostStatus?.myApps || boostStatus.myApps.length === 0) && (
                    <Card className="mb-4 border-dashed border-2 border-muted-foreground/20">
                        <CardContent className="py-8 items-center">
                            <View className="w-16 h-16 rounded-full bg-muted/50 items-center justify-center mb-3">
                                <Icon as={RocketIcon} className="text-muted-foreground size-8" />
                            </View>
                            <Text className="font-semibold text-foreground mb-1">No apps to boost</Text>
                            <Text className="text-sm text-muted-foreground text-center mb-4">
                                Add a recruiting app to start boosting
                            </Text>
                            <Button
                                variant="default"
                                onPress={() => router.push('/add-app')}
                            >
                                <Text className="text-white">Add an App</Text>
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Leaderboard */}
                <View className="mb-8">
                    <View className="flex-row items-center gap-2 mb-3">
                        <Icon as={TrophyIcon} className="text-yellow-500 size-5" />
                        <Text className="text-lg font-bold text-foreground">Leaderboard</Text>
                    </View>

                    {boostStatus?.topApps && boostStatus.topApps.length > 0 ? (
                        <View className="gap-2">
                            {boostStatus.topApps.map((app: any) => (
                                <TouchableOpacity
                                    key={app._id}
                                    onPress={() => router.push(`/app-details/${app._id}`)}
                                    activeOpacity={0.7}
                                >
                                    <View className={`flex-row items-center gap-3 p-3 rounded-xl border ${getRankColor(app.rank)}`}>
                                        <View className="w-10 items-center">
                                            <Text className="text-xl">{getMedalEmoji(app.rank)}</Text>
                                        </View>
                                        <Image
                                            source={{ uri: app.iconUrl }}
                                            style={{ width: 40, height: 40, borderRadius: 8 }}
                                            contentFit="cover"
                                        />
                                        <View className="flex-1">
                                            <Text className="font-semibold text-foreground text-sm" numberOfLines={1}>
                                                {app.title}
                                            </Text>
                                            <Text className="text-xs text-muted-foreground">
                                                by {app.ownerName}
                                            </Text>
                                        </View>
                                        <View className="items-end">
                                            <Text className="text-lg font-bold text-orange-500">
                                                {app.boostScore}
                                            </Text>
                                            <Text className="text-[10px] text-muted-foreground">pts</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : (
                        <Card className="border-dashed border-2 border-muted-foreground/20">
                            <CardContent className="py-6 items-center">
                                <Icon as={SparklesIcon} className="text-muted-foreground/50 size-8 mb-2" />
                                <Text className="text-muted-foreground text-center">
                                    No boosted apps yet. Be the first!
                                </Text>
                            </CardContent>
                        </Card>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}
