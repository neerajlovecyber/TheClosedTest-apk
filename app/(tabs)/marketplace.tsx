
import React, { useState, useRef, useCallback, useMemo, memo, useEffect } from 'react';
import { View, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator, Image } from 'react-native';
import { LegendList } from '@legendapp/list';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { Modal, Pressable, Linking } from 'react-native';
import { SearchIcon, StarIcon, PlusIcon, HelpCircleIcon, RocketIcon, FlameIcon, CheckCircleIcon, UsersIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { AppCard } from '@/components/AppCard';
import { GoogleGroupWidget } from '@/components/GoogleGroupWidget';
import { BoostedAppsSection } from '@/components/BoostedAppsSection';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay } from 'react-native-reanimated';
import { ReportDialog } from '@/components/ReportDialog';
import { Alert } from 'react-native';

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

    // Reporting state
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [reportApp, setReportApp] = useState<any>(null);
    const [showGroupModal, setShowGroupModal] = useState(false);

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index || 0);
        }
    });

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50
    });

    // Cached Queries
    const { data: user } = useCachedConvexQuery(['currentUser'], api.users.getCurrentUser);
    const { data: myApps = [] } = useCachedConvexQuery(['myApps'], api.apps.getMyApps);
    const { data: recruitingApps } = useCachedConvexQuery(['marketplaceRecruiting'], api.apps.getMarketplaceApps, { status: 'recruiting' });
    const { data: filledApps } = useCachedConvexQuery(['marketplaceFilled'], api.apps.getMarketplaceApps, { status: 'filled' });
    const { data: myMatchStatuses = [] } = useCachedConvexQuery(['matchStatus'], api.matches.getMyMatchStatuses);

    const displayRecruiting = recruitingApps || [];
    const displayFilled = filledApps || [];

    const matchStatusMap = useMemo(() => {
        const map = new Map();
        for (const status of myMatchStatuses) {
            map.set(status.appId, status.status);
        }
        return map;
    }, [myMatchStatuses]);

    // Memoize expensive computations
    const latestOpportunities = useMemo(() =>
        displayRecruiting
            .filter((app: any) => !app.isFilled)
            .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 16),
        [displayRecruiting]
    );

    const sortedAllApps = useMemo(() => {
        // Combine recruiting and filled apps, but exclude any that are completed
        const allApps = [...displayRecruiting, ...displayFilled].filter(
            (app: any) => app.status !== 'completed'
        );
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
        for (let i = 0; i < arr.length; i += 4) {
            chunked.push(arr.slice(i, i + 4));
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

    const handleReportApp = useCallback((app: any) => {
        setReportApp(app);

        // Show alert to confirm they want to report (since long press might be accidental)
        Alert.alert(
            "Report App",
            `Do you want to report "${app.title}"?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Report",
                    onPress: () => setShowReportDialog(true)
                }
            ]
        );
    }, []);

    // Memoized render functions for LegendList
    const renderAppItem = useCallback(({ item }: { item: any }) => (
        <AppCard
            key={item._id}
            item={item}
            onPress={() => handleAppPress(item._id)}
            onReport={() => handleReportApp(item)}
            matchStatus={matchStatusMap.get(item._id)}
        />
    ), [handleAppPress, matchStatusMap, handleReportApp]);

    const keyExtractor = useCallback((item: any) => item._id, []);

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
                    onReport={() => handleReportApp(app)}
                    matchStatus={matchStatusMap.get(app._id)}
                />
            ))}
        </View>
    ), [windowWidth, handleAppPress, matchStatusMap, handleReportApp]);

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
                        <View className="flex-row gap-2">
                            {/* Google Group Status Icon */}
                            {user?.isGroupMember && (
                                <TouchableOpacity
                                    onPress={() => setShowGroupModal(true)}
                                    className="w-10 h-10 rounded-full bg-green-500/10 items-center justify-center border border-green-500/20"
                                    activeOpacity={0.7}
                                >
                                    <Icon as={CheckCircleIcon} className="text-green-600 dark:text-green-400 size-5" />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                onPress={() => router.push('/help')}
                                className="w-10 h-10 rounded-full bg-orange-500/10 items-center justify-center border border-orange-500/20"
                                activeOpacity={0.7}
                            >
                                <Text className="text-orange-600 dark:text-orange-400 text-xl font-bold">?</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Show join prompt if not a member */}
                    {user && !user.isGroupMember && <GoogleGroupWidget className="mb-0" />}

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


                </View>
            </ScrollView>

            {/* Floating Action Button - Boost Hub with Premium Animation */}
            <AnimatedFAB onPress={() => router.push('/boost-hub')} />

            {/* Google Group Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={showGroupModal}
                onRequestClose={() => setShowGroupModal(false)}
            >
                <Pressable
                    className="flex-1 justify-end bg-black/50"
                    onPress={() => setShowGroupModal(false)}
                >
                    <Pressable className="bg-background rounded-t-3xl p-6">
                        <View className="flex-row items-center gap-3 mb-4">
                            <View className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                                <Icon as={UsersIcon} className="size-6 text-green-600 dark:text-green-400" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-xl font-bold text-foreground">Google Group</Text>
                                <Text className="text-sm text-muted-foreground">Community Member</Text>
                            </View>
                        </View>

                        <Text className="text-muted-foreground mb-4">
                            You're a verified member of our developer community Google Group.
                        </Text>

                        <Button
                            size="lg"
                            className="bg-green-600 dark:bg-green-600"
                            onPress={() => {
                                Linking.openURL("https://groups.google.com/g/developers-community-official");
                                setShowGroupModal(false);
                            }}
                        >
                            <Text className="text-white font-bold">Open Google Group</Text>
                        </Button>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Report Dialog */}
            {reportApp && (
                <ReportDialog
                    visible={showReportDialog}
                    onClose={() => setShowReportDialog(false)}
                    reportType="app"
                    targetId={reportApp._id}
                    reportedAppId={reportApp._id}
                    targetName={reportApp.title}
                />
            )}
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
