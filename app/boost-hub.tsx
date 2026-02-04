import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Platform, Modal, Image as RNImage } from 'react-native';
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
    XIcon,
    SmartphoneIcon,
    ChevronRightIcon,
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
    ? TestIds.REWARDED
    : 'ca-app-pub-3238435978294704/6838839038';

export default function BoostHubScreen() {
    const router = useRouter();
    const { data: boostStatus } = useCachedConvexQuery(['boostStatus'], api.boost.getBoostStatus);
    const earnBoostPoints = useMutation(api.boost.earnBoostPoints);
    const selectBoostedApp = useMutation(api.boost.selectBoostedApp);
    const initBoostCycle = useMutation(api.boost.initBoostCycle);
    const { loaded: adLoaded, loading: adLoading, showAd } = useRewardedAd(BOOST_AD_UNIT_ID);

    const [boosting, setBoosting] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState<number>(0);
    const [cycleInitialized, setCycleInitialized] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);

    // Initialize boost cycle on mount
    useEffect(() => {
        if (!cycleInitialized) {
            initBoostCycle().then(() => {
                setCycleInitialized(true);
            }).catch(console.error);
        }
    }, []);

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

    const handleEarnPoints = async () => {
        // BYPASS ADS: Direct logic for testing
        /*
        if (Platform.OS === 'web') {
            toast.info('Ads Not Available', { description: 'Rewarded ads are only available on mobile devices.' });
            return;
        }
        */

        if (!boostStatus?.selectedApp) {
            toast.info('Select an App', { description: 'Please select an app to boost first.' });
            setIsModalVisible(true);
            return;
        }

        /*
        if (!adLoaded) {
            toast.info('Ad Loading', { description: 'Please wait while the ad loads...' });
            return;
        }
        */

        setBoosting(true);
        try {
            // BYPASS: Skip actual ad show
            // const rewarded = await showAd(); 
            const rewarded = true;

            if (rewarded) {
                const result = await earnBoostPoints();
                toast.success('Dev Bypass: Points Earned! 🚀', {
                    description: `+${result.pointsEarned} point! Total: ${result.newPoints}`,
                });
            }
        } catch (error: any) {
            console.error('Boost failed:', error);
            toast.error('Failed', { description: error.message || 'Please try again.' });
        } finally {
            setBoosting(false);
        }
    };

    const handleSelectApp = async (appId: string) => {
        try {
            await selectBoostedApp({ appId: appId as Id<"apps"> });
            toast.success('App Selected', { description: 'Your points will now boost this app!' });
            setIsModalVisible(false);
        } catch (error: any) {
            toast.error('Error', { description: error.message || 'Failed to select app.' });
        }
    };

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

                {/* Countdown Timer */}
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

                {/* Your Points Display */}
                <Card className="mb-4 border-orange-400/30 bg-orange-500/5">
                    <CardContent className="p-4">
                        <View className="flex-row items-center justify-between">
                            <View>
                                <Text className="text-sm text-muted-foreground">Your Boost Points</Text>
                                <Text className="text-3xl font-bold text-orange-500">{boostStatus?.userPoints || 0}</Text>
                            </View>
                            <View className="h-14 w-14 rounded-full bg-orange-500/20 items-center justify-center">
                                <Icon as={TrendingUpIcon} className="text-orange-500 size-7" />
                            </View>
                        </View>
                    </CardContent>
                </Card>

                {/* Selected App to Boost - Like swap picker */}
                <View className="mb-4">
                    <Text className="text-xs font-bold text-muted-foreground px-1 mb-2 uppercase tracking-widest">
                        App to Boost
                    </Text>
                    <Card className="border-0 overflow-hidden">
                        <CardContent className="p-0">
                            {boostStatus?.selectedApp ? (
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setIsModalVisible(true)}
                                    className="p-4 flex-row items-center gap-4"
                                >
                                    <Image
                                        source={{ uri: boostStatus.selectedApp.iconUrl }}
                                        style={{ width: 48, height: 48, borderRadius: 12 }}
                                        contentFit="cover"
                                    />
                                    <View className="flex-1">
                                        <Text className="font-bold text-base text-foreground">{boostStatus.selectedApp.title}</Text>
                                        <Text className="text-xs text-muted-foreground">Tap to change app</Text>
                                    </View>
                                    <View className="flex-row items-center gap-2">
                                        <View className="bg-orange-500/10 px-2 py-1 rounded-md">
                                            <Text className="text-xs font-bold text-orange-500">{boostStatus?.userPoints || 0} pts</Text>
                                        </View>
                                        <Icon as={ChevronRightIcon} className="text-muted-foreground size-5" />
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setIsModalVisible(true)}
                                    className="p-6 items-center justify-center bg-secondary/20"
                                >
                                    <View className="h-12 w-12 rounded-full bg-orange-500/10 items-center justify-center mb-2">
                                        <Icon as={SmartphoneIcon} className="text-orange-500 size-6" />
                                    </View>
                                    <Text className="font-semibold text-foreground">Select an App to Boost</Text>
                                    <Text className="text-xs text-muted-foreground text-center mt-1">
                                        Your points will apply to the selected app
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </CardContent>
                    </Card>
                </View>

                {/* Main CTA Button */}
                <TouchableOpacity
                    onPress={handleEarnPoints}
                    disabled={boosting}
                    activeOpacity={0.8}
                    className="w-full py-4 rounded-2xl bg-orange-500 items-center justify-center mb-4"
                    style={{
                        opacity: boosting ? 0.6 : 1,
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
                            {boosting ? 'Boosting...' : 'DEV BYPASS: CLICK TO EARN'}
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* Leaderboard */}
                <View className="mb-8">
                    <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-row items-center gap-2">
                            <Icon as={TrophyIcon} className="text-yellow-500 size-5" />
                            <Text className="text-lg font-bold text-foreground">Leaderboard</Text>
                        </View>
                        <View className="bg-yellow-500/10 px-2 py-0.5 rounded-full">
                            <Text className="text-[10px] font-bold text-yellow-600">TOP 5</Text>
                        </View>
                    </View>

                    {boostStatus?.topApps && boostStatus.topApps.length > 0 ? (
                        <Card className="overflow-hidden border-border">
                            <CardContent className="p-0">
                                {boostStatus.topApps.map((app: any, index: number) => {
                                    const isFirst = index === 0;
                                    const maxScore = boostStatus.topApps[0]?.boostScore || 1;
                                    const progress = (app.boostScore / maxScore) * 100;

                                    return (
                                        <TouchableOpacity
                                            key={app._id}
                                            onPress={() => router.push(`/app-details/${app._id}`)}
                                            activeOpacity={0.7}
                                        >
                                            <View className={`flex-row items-center gap-3 p-3 ${index < boostStatus.topApps.length - 1 ? 'border-b border-border/50' : ''} ${isFirst ? 'bg-yellow-500/5' : ''}`}>
                                                <View className={`w-8 h-8 rounded-lg items-center justify-center ${app.rank === 1 ? 'bg-yellow-500' :
                                                    app.rank === 2 ? 'bg-gray-400' :
                                                        app.rank === 3 ? 'bg-orange-600' :
                                                            'bg-muted'
                                                    }`}>
                                                    <Text className={`font-bold text-sm ${app.rank <= 3 ? 'text-white' : 'text-muted-foreground'}`}>
                                                        {app.rank}
                                                    </Text>
                                                </View>

                                                <Image
                                                    source={{ uri: app.iconUrl }}
                                                    style={{
                                                        width: isFirst ? 48 : 40,
                                                        height: isFirst ? 48 : 40,
                                                        borderRadius: isFirst ? 12 : 8,
                                                        borderWidth: isFirst ? 2 : 0,
                                                        borderColor: '#facc15',
                                                    }}
                                                    contentFit="cover"
                                                />

                                                <View className="flex-1">
                                                    <Text className={`font-semibold text-foreground ${isFirst ? 'text-base' : 'text-sm'}`} numberOfLines={1}>
                                                        {app.title}
                                                    </Text>
                                                    <Text className="text-xs text-muted-foreground">
                                                        {app.ownerName}
                                                    </Text>
                                                    <View className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                                                        <View
                                                            className="h-full bg-orange-500 rounded-full"
                                                            style={{ width: `${progress}%` }}
                                                        />
                                                    </View>
                                                </View>

                                                <View className="items-end">
                                                    <Text className={`font-bold text-orange-500 ${isFirst ? 'text-xl' : 'text-lg'}`}>
                                                        {app.boostScore}
                                                    </Text>
                                                    <Text className="text-[10px] text-muted-foreground">points</Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
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
                                <Text className="font-semibold text-foreground mb-1">No one's here yet!</Text>
                                <Text className="text-sm text-muted-foreground text-center">
                                    Be the first to claim the #1 spot
                                </Text>
                            </CardContent>
                        </Card>
                    )}
                </View>
            </ScrollView>

            {/* App Selection Modal - Same style as swap picker */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => setIsModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-background rounded-t-3xl p-6 min-h-[50%]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold">Select App to Boost</Text>
                            <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                                <Icon as={XIcon} className="size-6 text-muted-foreground" />
                            </TouchableOpacity>
                        </View>

                        {boostStatus?.myApps && boostStatus.myApps.length > 0 ? (
                            <ScrollView>
                                {boostStatus.myApps.map((app: any) => (
                                    <TouchableOpacity
                                        key={app._id}
                                        className={`flex-row items-center gap-4 p-4 mb-3 rounded-xl border ${boostStatus?.selectedApp?._id === app._id
                                            ? 'border-orange-500 bg-orange-500/5'
                                            : 'border-border'
                                            }`}
                                        onPress={() => handleSelectApp(app._id)}
                                    >
                                        <Image
                                            source={{ uri: app.iconUrl }}
                                            style={{ width: 48, height: 48, borderRadius: 12 }}
                                            contentFit="cover"
                                        />
                                        <View className="flex-1">
                                            <Text className="font-bold text-lg text-foreground">{app.title}</Text>
                                            <Text className="text-muted-foreground text-sm">
                                                {app.requiredTesters} testers needed
                                            </Text>
                                        </View>
                                        {boostStatus?.selectedApp?._id === app._id && (
                                            <Icon as={CheckCircleIcon} className="text-orange-500 size-5" />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        ) : (
                            <View className="items-center py-10 gap-4">
                                <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
                                    <Icon as={SmartphoneIcon} className="text-muted-foreground size-8" />
                                </View>
                                <Text className="text-muted-foreground text-center">You don't have any recruiting apps.</Text>
                                <Button onPress={() => { setIsModalVisible(false); router.push('/add-app'); }}>
                                    <Text className="text-white">Add New App</Text>
                                </Button>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}
