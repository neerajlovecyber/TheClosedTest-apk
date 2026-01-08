
import React, { useState, useRef, useCallback, useMemo, memo, Suspense, lazy } from 'react';
import { View, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator } from 'react-native';
import { LegendList } from '@legendapp/list';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { SearchIcon, StarIcon, PlusIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { AppCard } from '@/components/AppCard';
import { GoogleGroupWidget } from '@/components/GoogleGroupWidget';

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

    // Memoize expensive computations
    const latestOpportunities = useMemo(() =>
        displayRecruiting.filter((app: any) => !app.isFilled),
        [displayRecruiting]
    );

    const sortedAllApps = useMemo(() => {
        const allApps = [...displayRecruiting, ...displayFilled];
        return allApps.sort((a: any, b: any) => {
            if (a.isFilled && !b.isFilled) return 1;
            if (!a.isFilled && b.isFilled) return -1;
            return 0;
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
                    <View className="mb-0">
                        <Text className="text-3xl font-extrabold text-foreground tracking-tight">Marketplace</Text>
                        <Text className="text-sm text-muted-foreground font-medium mt-0.5">Find apps, swap tests, get published.</Text>
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
                                {myApps.length < 3 && (
                                    <Button variant="link" onPress={handleAddApp}>
                                        <Text>Add your first app</Text>
                                    </Button>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            {/* Quick Add App FAB */}
            {myApps.length < 3 && (
                <View className="absolute bottom-6 right-6">
                    <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onPress={handleAddApp}>
                        <Icon as={PlusIcon} className="text-primary-foreground size-8" />
                    </Button>
                </View>
            )}
        </View>
    );
}
