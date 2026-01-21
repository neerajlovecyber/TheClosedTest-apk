
import React, { useState, useRef, useCallback, useMemo, memo, useEffect } from 'react';
import { View, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator, Image, Linking } from 'react-native';
import { LegendList } from '@legendapp/list';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { SearchIcon, StarIcon, PlusIcon, HelpCircleIcon, RocketIcon, TrophyIcon, FlameIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { AppCard } from '@/components/AppCard';
import { GoogleGroupWidget } from '@/components/GoogleGroupWidget';
import { BoostedAppsSection } from '@/components/BoostedAppsSection';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay } from 'react-native-reanimated';

// Loading placeholder component
const ListLoadingPlaceholder = memo(() => (
    <View className="items-center justify-center py-8">
        <ActivityIndicator size="small" />
        <Text className="text-muted-foreground text-sm mt-2">Loading apps...</Text>
    </View>
));

export default function MarketplaceScreen() {
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index || 0);
        }
    });

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50
    });

    const myApps = useQuery(api.apps.getMyApps) || [];

    const { data: recruitingApps } = useCachedConvexQuery(['marketplaceRecruiting'], api.apps.getMarketplaceApps, { status: 'recruiting' });
    const { data: filledApps } = useCachedConvexQuery(['marketplaceFilled'], api.apps.getMarketplaceApps, { status: 'filled' });

    const displayRecruiting = recruitingApps || [];
    const displayFilled = filledApps || [];

    // Hall of Fame - Completed apps
    const { data: completedApps } = useCachedConvexQuery(['marketplaceCompleted'], api.apps.getCompletedApps);

    // Memoize expensive computations
    const latestOpportunities = useMemo(() =>
        displayRecruiting
            .filter((app: any) => !app.isFilled)
            .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)),
        [displayRecruiting]
    );

    const sortedAllApps = useMemo(() => {
        const allApps = [...displayRecruiting, ...displayFilled];
        return allApps.sort((a: any, b: any) => {
            // Priority 1: Status (Active first)
            if (a.isFilled && !b.isFilled) return 1;
            if (!a.isFilled && b.isFilled) return -1;

            // Priority 2: Reputation (High to Low)
            const repDiff = (b.reputation || 0) - (a.reputation || 0);
            if (repDiff !== 0) return repDiff;

            // Priority 3: Creation Date (Newest first)
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
    }, [displayRecruiting, displayFilled]);

    const filteredAllApps = useMemo(() =>
        sortedAllApps.filter((app: any) =>
            app.title.toLowerCase().includes(searchQuery.toLowerCase())
        ),
        [sortedAllApps, searchQuery]
    );

    const groupedRecruiting = useMemo(() => {
        const chunked = [];
        const arr = latestOpportunities || [];
        for (let i = 0; i < arr.length; i += 3) {
            chunked.push(arr.slice(i, i + 3));
        }
        return chunked;
    }, [latestOpportunities]);

    // Memoized callbacks for navigation
    const handleAppPress = useCallback((appId: string) => {
        router.push({ pathname: "/app-details/[id]", params: { id: appId, source: 'marketplace' } } as any);
    }, [router]);

    const handleAddApp = useCallback(() => {
        router.push('/add-app');
    }, [router]);

    // Memoized render functions for LegendList
    const renderAppItem = useCallback(({ item }: { item: any }) => (
        <AppCard
            key={item._id}
            item={item}
            onPress={() => handleAppPress(item._id)}
        />
    ), [handleAppPress]);

    const keyExtractor = useCallback((item: any) => item._id, []);

    // Open Play Store for Hall of Fame apps
    const handleOpenPlayStore = useCallback((app: any) => {
        if (!app.packageName) return;

        const marketUrl = `market://details?id=${app.packageName}`;
        const webUrl = app.playStoreUrl || `https://play.google.com/store/apps/details?id=${app.packageName}`;

        Linking.canOpenURL(marketUrl).then(supported => {
            if (supported) {
                Linking.openURL(marketUrl);
            } else {
                Linking.openURL(webUrl);
            }
        }).catch(() => {
            Linking.openURL(webUrl);
        });
    }, []);

    // Horizontal carousel render item
    const renderGroupItem = useCallback(({ item: group }: { item: any[] }) => (
        <View style={{ width: windowWidth * 0.85 }} className="mr-4">
            {group.map((app: any) => (
                <AppCard
                    key={app._id}
                    item={app}
                    onPress={() => handleAppPress(app._id)}
                />
            ))}
        </View>
    ), [windowWidth, handleAppPress]);

    const groupKeyExtractor = useCallback((item: any[], index: number) => `group-${index}`, []);

    return (
        <View className="flex-1 bg-background">
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
                <View className="gap-3">
                    <View className="mb-0 flex-row justify-between items-start">
                        <View>
                            <Text className="text-3xl font-extrabold text-foreground tracking-tight">Marketplace</Text>
                            <Text className="text-sm text-muted-foreground font-medium mt-0.5">Find apps, swap tests, get published.</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => router.push('/help')}
                            className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
                            activeOpacity={0.7}
                        >
                            <Icon as={HelpCircleIcon} className="text-primary size-5" />
                        </TouchableOpacity>
                    </View>

                    <GoogleGroupWidget className="mb-0" />

                    {/* Search Bar */}
                    <View className="relative">
                        <View className="absolute left-3 top-3 z-10">
                            <Icon as={SearchIcon} className="size-4 text-muted-foreground" />
                        </View>
                        <Input
                            placeholder="Find specific apps..."
                            className="pl-9 h-10 bg-card border-border shadow-sm text-foreground"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>

                    {/* Boosted Apps Section */}
                    {!searchQuery && <BoostedAppsSection />}

                    {/* Recruiting Now / Latest */}
                    {!searchQuery && (
                        <View>
                            <Text className="text-lg font-bold px-1 mb-3">Latest Opportunities</Text>
                            {groupedRecruiting.length > 0 ? (
                                <View>
                                    <LegendList
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        data={groupedRecruiting}
                                        keyExtractor={groupKeyExtractor}
                                        snapToInterval={windowWidth * 0.85 + 16}
                                        decelerationRate="fast"
                                        snapToAlignment="start"
                                        onViewableItemsChanged={onViewableItemsChanged.current}
                                        viewabilityConfig={viewabilityConfig.current}
                                        contentContainerStyle={{ paddingRight: 16 }}
                                        renderItem={renderGroupItem}
                                        recycleItems
                                        estimatedItemSize={windowWidth * 0.85}
                                    />
                                    {/* Pagination Dots */}
                                    <View className="flex-row justify-center mt-2 gap-2">
                                        {groupedRecruiting.map((_, index) => (
                                            <View
                                                key={index}
                                                className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'}`}
                                            />
                                        ))}
                                    </View>
                                </View>
                            ) : (
                                <View className="items-center py-4">
                                    <Text className="text-muted-foreground">No new apps.</Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* All Apps - Using LegendList for performance */}
                    <View>
                        <Text className="text-lg font-bold px-1 mb-3">{searchQuery ? 'Search Results' : 'All Apps'}</Text>
                        {filteredAllApps.length > 0 ? (
                            <LegendList
                                data={filteredAllApps}
                                keyExtractor={keyExtractor}
                                renderItem={renderAppItem}
                                recycleItems
                                estimatedItemSize={120}
                                scrollEnabled={false}
                            />
                        ) : (
                            <View className="items-center py-10">
                                <Text className="text-muted-foreground">No apps found.</Text>
                            </View>
                        )}
                    </View>

                    {/* Hall of Fame - Successfully Launched Apps */}
                    {!searchQuery && completedApps && completedApps.length > 0 && (
                        <View className="mt-4">
                            <View className="flex-row items-center gap-2 px-1 mb-3">
                                <Icon as={TrophyIcon} className="size-5 text-yellow-500" />
                                <Text className="text-lg font-bold">Hall of Fame</Text>
                                <Icon as={RocketIcon} className="size-4 text-green-500" />
                            </View>
                            <Text className="text-xs text-muted-foreground px-1 mb-3">Apps that got production access</Text>
                            <View className="gap-3">
                                {completedApps.slice(0, 10).map((app: any) => (
                                    <TouchableOpacity
                                        key={app._id}
                                        onPress={() => handleOpenPlayStore(app)}
                                        activeOpacity={0.7}
                                        className="flex-row items-center gap-3 p-3 bg-gradient-to-r from-green-500/10 to-yellow-500/10 border border-green-500/20 rounded-xl"
                                    >
                                        <View className="relative">
                                            <Image
                                                source={{ uri: app.iconUrl || 'https://github.com/shadcn.png' }}
                                                className="w-12 h-12 rounded-xl bg-muted"
                                            />
                                            <View className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1">
                                                <Icon as={RocketIcon} className="size-3 text-white" />
                                            </View>
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-foreground">{app.title}</Text>
                                            <Text className="text-xs text-muted-foreground">
                                                by {app.ownerName} • Launched {app.completedAt ? new Date(app.completedAt).toLocaleDateString() : ''}
                                            </Text>
                                        </View>
                                        <View className="bg-green-500/20 px-2 py-1 rounded-full">
                                            <Text className="text-[10px] font-bold text-green-600 dark:text-green-400">🚀 LAUNCHED</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Floating Action Button - Boost Hub with Premium Animation */}
            <AnimatedFAB onPress={() => router.push('/boost-hub')} />
        </View>
    );
}

// Animated FAB Component with pulsing glow effect
function AnimatedFAB({ onPress }: { onPress: () => void }) {
    const scale = useSharedValue(1);
    const glowOpacity = useSharedValue(0.3);

    useEffect(() => {
        // Pulsing scale animation
        scale.value = withRepeat(
            withSequence(
                withTiming(1.05, { duration: 1000 }),
                withTiming(1, { duration: 1000 })
            ),
            -1,
            true
        );

        // Glow pulse animation
        glowOpacity.value = withRepeat(
            withSequence(
                withTiming(0.6, { duration: 1000 }),
                withTiming(0.2, { duration: 1000 })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const glowStyle = useAnimatedStyle(() => ({
        opacity: glowOpacity.value,
    }));

    return (
        <View className="absolute bottom-6 right-6">
            {/* Outer glow ring */}
            <Animated.View
                style={[glowStyle, {
                    position: 'absolute',
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: '#f97316',
                    top: -8,
                    left: -8,
                }]}
            />
            {/* Main button */}
            <Animated.View style={animatedStyle}>
                <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.8}
                    className="w-16 h-16 rounded-full items-center justify-center"
                    style={{
                        backgroundColor: '#f97316',
                        elevation: 12,
                        shadowColor: '#f97316',
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.5,
                        shadowRadius: 12,
                    }}
                >
                    <Icon as={RocketIcon} className="text-white size-7" />
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}
