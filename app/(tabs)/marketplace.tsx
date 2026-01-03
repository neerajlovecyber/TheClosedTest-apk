
import React, { useState } from 'react';
import { View, FlatList, Image, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { SearchIcon, StarIcon, PlusIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { AppCard } from '@/components/AppCard';
import { GoogleGroupWidget } from '@/components/GoogleGroupWidget';




export default function MarketplaceScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');

    const recruitingApps = useQuery(api.apps.getMarketplaceApps, { status: 'recruiting' });
    const filledApps = useQuery(api.apps.getMarketplaceApps, { status: 'filled' });

    const displayRecruiting = recruitingApps || [];
    const displayFilled = filledApps || [];

    // Filter out filled apps from Latest Opportunities (only show non-filled recruiting apps)
    const latestOpportunities = displayRecruiting.filter((app: any) => !app.isFilled);

    // All Apps: recruiting first (non-filled), then filled apps at the end
    const allApps = [...displayRecruiting, ...displayFilled];
    const sortedAllApps = allApps.sort((a: any, b: any) => {
        if (a.isFilled && !b.isFilled) return 1;  // Filled goes after non-filled
        if (!a.isFilled && b.isFilled) return -1; // Non-filled goes before filled
        return 0; // Keep original order otherwise
    });
    const filteredAllApps = sortedAllApps.filter((app: any) => app.title.toLowerCase().includes(searchQuery.toLowerCase()));

    const chunkArray = (arr: any[], size: number) => {
        const chunked = [];
        if (!arr) return [];
        for (let i = 0; i < arr.length; i += size) {
            chunked.push(arr.slice(i, i + size));
        }
        return chunked;
    };

    const groupedRecruiting = chunkArray(latestOpportunities || [], 3);

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
                    {/* Compact Search Bar - Optional if header search icon is used, but keeping for utility */}
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
                                <FlatList
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    data={groupedRecruiting}
                                    keyExtractor={(item, index) => `group-${index}`}
                                    renderItem={({ item: group }) => (
                                        <View className="w-[85vw] max-w-sm mr-4">
                                            {group.map((app: any) => (
                                                <AppCard key={app._id} item={app} onPress={() => router.push({ pathname: "/app-details/[id]", params: { id: app._id, source: 'marketplace' } } as any)} />
                                            ))}
                                        </View>
                                    )}
                                />
                            ) : (
                                <View className="items-center py-4">
                                    <Text className="text-muted-foreground">No new apps.</Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* All Apps */}
                    <View>
                        <Text className="text-lg font-bold px-1 mb-3">{searchQuery ? 'Search Results' : 'All Apps'}</Text>
                        {filteredAllApps.length > 0 ? (
                            <View>
                                {filteredAllApps.map((app) => (
                                    <AppCard key={app._id} item={app} onPress={() => router.push({ pathname: "/app-details/[id]", params: { id: app._id, source: 'marketplace' } } as any)} />
                                ))}
                            </View>
                        ) : (
                            <View className="items-center py-10">
                                <Text className="text-muted-foreground">No apps found.</Text>
                                <Button variant="link" onPress={() => router.push('/add-app')}>
                                    <Text>Add your first app</Text>
                                </Button>
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            {/* Quick Add App FAB */}
            <View className="absolute bottom-6 right-6">
                <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onPress={() => router.push('/add-app')}>
                    <Icon as={PlusIcon} className="text-primary-foreground size-8" />
                </Button>
            </View>
        </View>
    );
}
