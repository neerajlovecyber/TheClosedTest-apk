
import React, { useState } from 'react';
import { View, FlatList, Image, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { SearchIcon, StarIcon, PlusIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function MarketplaceScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');

    const recruitingApps = useQuery(api.apps.getMarketplaceApps, { status: 'recruiting' });
    const filledApps = useQuery(api.apps.getMarketplaceApps, { status: 'filled' });

    // Dummy Data
    const dummyRecruiting = [
        { _id: 'dm1', title: 'SSB Buddy', packageName: 'com.example.ssb', iconUrl: 'https://github.com/shadcn.png', currentTesters: 0, requiredTesters: 14, status: 'recruiting', ownerName: 'Neeraj Singh', ownerAvatar: 'https://github.com/shadcn.png', reputation: 100 },
        { _id: 'dm2', title: 'Crypto Tracker', packageName: 'com.game.test', iconUrl: 'https://github.com/shadcn.png', currentTesters: 8, requiredTesters: 20, status: 'recruiting', ownerName: 'Alex Doe', ownerAvatar: 'https://github.com/shadcn.png', reputation: 95 },
    ];

    const dummyFilled = [
        { _id: 'dm3', title: 'Fitness Pro', packageName: 'com.util.pro', iconUrl: 'https://github.com/shadcn.png', currentTesters: 12, requiredTesters: 12, status: 'filled', ownerName: 'Sarah M', ownerAvatar: 'https://github.com/shadcn.png', reputation: 98 },
        { _id: 'dm4', title: 'Puzzle Master', packageName: 'com.game.puz', iconUrl: 'https://github.com/shadcn.png', currentTesters: 20, requiredTesters: 20, status: 'filled', ownerName: 'John D', ownerAvatar: 'https://github.com/shadcn.png', reputation: 92 },
    ];

    const displayRecruiting = (recruitingApps && recruitingApps.length > 0) ? recruitingApps : dummyRecruiting;
    const displayFilled = (filledApps && filledApps.length > 0) ? filledApps : dummyFilled;

    const filteredRecruiting = displayRecruiting?.filter(app => app.title.toLowerCase().includes(searchQuery.toLowerCase()));

    const HorizontalAppCard = ({ item }: { item: any }) => (
        <TouchableOpacity
            onPress={() => router.push(`/app-details/${item._id}`)}
            activeOpacity={0.7}
            className="mr-3"
        >
            <Card className="w-36">
                <CardContent>
                    <Image
                        source={{ uri: item.iconUrl }}
                        className="w-10 h-10 rounded-lg bg-muted mb-2"
                    />
                    <Text className="font-bold text-sm leading-tight mb-1" numberOfLines={1}>{item.title}</Text>
                    <Text className="text-xs text-muted-foreground mb-1" numberOfLines={1}>{item.ownerName}</Text>

                    <View className="bg-secondary/50 px-1.5 py-0.5 rounded self-start">
                        <Text className="text-[10px] font-medium text-foreground">Filled</Text>
                    </View>
                </CardContent>
            </Card>
        </TouchableOpacity>
    );

    const VerticalAppCard = ({ item }: { item: any }) => (
        <TouchableOpacity
            onPress={() => router.push(`/app-details/${item._id}`)}
            activeOpacity={0.7}
        >
            <Card className="mb-3">
                <CardContent className="flex-row gap-3">
                    <Image
                        source={{ uri: item.iconUrl }}
                        className="w-20 h-20 rounded-xl bg-muted border border-border"
                    />
                    <View className="flex-1 justify-between py-0.5">
                        <View className="flex-row justify-between items-start">
                            <Text className="font-bold text-lg leading-tight flex-1 mr-2">{item.title}</Text>
                            <View className="bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                                <Text className="text-[10px] text-green-600 dark:text-green-400 font-bold uppercase">New</Text>
                            </View>
                        </View>
                        <Text className="text-muted-foreground text-sm">
                            {item.currentTesters || 0} / {item.requiredTesters || 12} Testers
                        </Text>
                        <View className="flex-row items-center gap-3 mt-1">
                            <View className="flex-row items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md">
                                <Image source={{ uri: item.ownerAvatar || 'https://github.com/shadcn.png' }} className="w-4 h-4 rounded-full bg-muted" />
                                <Text className="text-xs font-medium text-foreground">{item.ownerName || 'Unknown'}</Text>
                            </View>
                            <View className="flex-row items-center gap-1">
                                <Icon as={StarIcon} className="size-3 text-green-600 dark:text-green-500 fill-green-600 dark:fill-green-500" />
                                <Text className="text-xs text-green-600 dark:text-green-500 font-bold">{item.reputation || 100}%</Text>
                            </View>
                        </View>
                    </View>
                </CardContent>
            </Card>
        </TouchableOpacity>
    );

    return (
        <View className="flex-1 bg-background">
            <FlatList
                data={filteredRecruiting}
                renderItem={VerticalAppCard}
                keyExtractor={(item) => item._id}
                contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
                ListHeaderComponent={
                    <View className="gap-6 mb-4">
                        {/* Search Bar */}
                        <View className="relative">
                            <View className="absolute left-3 top-3 z-10">
                                <Icon as={SearchIcon} className="size-5 text-muted-foreground" />
                            </View>
                            <Input
                                placeholder="Search apps..."
                                className="pl-10 h-11"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>

                        {/* In Progress / Recent Filled Section */}
                        {displayFilled && displayFilled.length > 0 && (
                            <View>
                                <Text className="text-lg font-bold mb-3 px-1">Recently Filled</Text>
                                <FlatList
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    data={displayFilled}
                                    renderItem={HorizontalAppCard}
                                    keyExtractor={item => item._id}
                                    contentContainerStyle={{ paddingRight: 16 }}
                                />
                            </View>
                        )}

                        <Text className="text-lg font-bold px-1">Recruiting Now</Text>
                    </View>
                }
                ListEmptyComponent={
                    <View className="items-center py-10">
                        <Text className="text-muted-foreground">No apps found.</Text>
                        <Button variant="link" onPress={() => router.push('/add-app')}>
                            <Text>Add your first app</Text>
                        </Button>
                    </View>
                }
            />

            {/* Quick Add App FAB */}
            <View className="absolute bottom-6 right-6">
                <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onPress={() => router.push('/add-app')}>
                    <Icon as={PlusIcon} className="text-primary-foreground size-8" />
                </Button>
            </View>
        </View>
    );
}
