
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




export default function MarketplaceScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');

    const recruitingApps = useQuery(api.apps.getMarketplaceApps, { status: 'recruiting' });
    const filledApps = useQuery(api.apps.getMarketplaceApps, { status: 'filled' });

    // Dummy Data
    const dummyRecruiting = [
        { _id: 'dm1', title: 'SSB Buddy', packageName: 'com.example.ssb', iconUrl: 'https://github.com/shadcn.png', currentTesters: 0, requiredTesters: 14, status: 'recruiting', ownerName: 'Neeraj Singh', ownerAvatar: 'https://github.com/shadcn.png', reputation: 100 },
        { _id: 'dm2', title: 'Crypto Tracker', packageName: 'com.game.test', iconUrl: 'https://github.com/shadcn.png', currentTesters: 8, requiredTesters: 20, status: 'recruiting', ownerName: 'Alex Doe', ownerAvatar: 'https://github.com/shadcn.png', reputation: 95 },
        { _id: 'dm5', title: 'Language Learner', packageName: 'com.edu.lang', iconUrl: 'https://github.com/shadcn.png', currentTesters: 2, requiredTesters: 10, status: 'recruiting', ownerName: 'Maria G', ownerAvatar: 'https://github.com/shadcn.png', reputation: 98 },
        { _id: 'dm6', title: 'Budget Planner', packageName: 'com.fin.budget', iconUrl: 'https://github.com/shadcn.png', currentTesters: 5, requiredTesters: 15, status: 'recruiting', ownerName: 'Tom H', ownerAvatar: 'https://github.com/shadcn.png', reputation: 90 },
        { _id: 'dm7', title: 'Yoga Daily', packageName: 'com.health.yoga', iconUrl: 'https://github.com/shadcn.png', currentTesters: 1, requiredTesters: 20, status: 'recruiting', ownerName: 'Lisa K', ownerAvatar: 'https://github.com/shadcn.png', reputation: 99 },
        { _id: 'dm8', title: 'Task Master', packageName: 'com.prod.task', iconUrl: 'https://github.com/shadcn.png', currentTesters: 10, requiredTesters: 12, status: 'recruiting', ownerName: 'David B', ownerAvatar: 'https://github.com/shadcn.png', reputation: 88 },
        { _id: 'dm9', title: 'Recipe Book', packageName: 'com.food.recipe', iconUrl: 'https://github.com/shadcn.png', currentTesters: 4, requiredTesters: 8, status: 'recruiting', ownerName: 'Chef P', ownerAvatar: 'https://github.com/shadcn.png', reputation: 96 },
        { _id: 'dm10', title: 'Travel Log', packageName: 'com.travel.log', iconUrl: 'https://github.com/shadcn.png', currentTesters: 6, requiredTesters: 10, status: 'recruiting', ownerName: 'Wander L', ownerAvatar: 'https://github.com/shadcn.png', reputation: 93 },
        { _id: 'dm11', title: 'Photo Editor', packageName: 'com.art.photo', iconUrl: 'https://github.com/shadcn.png', currentTesters: 3, requiredTesters: 18, status: 'recruiting', ownerName: 'Pixel A', ownerAvatar: 'https://github.com/shadcn.png', reputation: 97 },
    ];

    const dummyFilled = [
        { _id: 'dm3', title: 'Fitness Pro', packageName: 'com.util.pro', iconUrl: 'https://github.com/shadcn.png', currentTesters: 12, requiredTesters: 12, status: 'filled', ownerName: 'Sarah M', ownerAvatar: 'https://github.com/shadcn.png', reputation: 98 },
        { _id: 'dm4', title: 'Puzzle Master', packageName: 'com.game.puz', iconUrl: 'https://github.com/shadcn.png', currentTesters: 20, requiredTesters: 20, status: 'filled', ownerName: 'John D', ownerAvatar: 'https://github.com/shadcn.png', reputation: 92 },
        { _id: 'dm12', title: 'Music Stream', packageName: 'com.media.music', iconUrl: 'https://github.com/shadcn.png', currentTesters: 50, requiredTesters: 50, status: 'filled', ownerName: 'Audio X', ownerAvatar: 'https://github.com/shadcn.png', reputation: 95 },
        { _id: 'dm13', title: 'Weather Now', packageName: 'com.info.weather', iconUrl: 'https://github.com/shadcn.png', currentTesters: 15, requiredTesters: 15, status: 'filled', ownerName: 'Sky Watch', ownerAvatar: 'https://github.com/shadcn.png', reputation: 89 },
        { _id: 'dm14', title: 'Notes Keep', packageName: 'com.prod.notes', iconUrl: 'https://github.com/shadcn.png', currentTesters: 10, requiredTesters: 10, status: 'filled', ownerName: 'Write On', ownerAvatar: 'https://github.com/shadcn.png', reputation: 94 },
        { _id: 'dm15', title: 'Calorie Count', packageName: 'com.health.cal', iconUrl: 'https://github.com/shadcn.png', currentTesters: 25, requiredTesters: 25, status: 'filled', ownerName: 'Fit Life', ownerAvatar: 'https://github.com/shadcn.png', reputation: 91 },
        { _id: 'dm16', title: 'Code Editor', packageName: 'com.dev.code', iconUrl: 'https://github.com/shadcn.png', currentTesters: 30, requiredTesters: 30, status: 'filled', ownerName: 'Dev Tool', ownerAvatar: 'https://github.com/shadcn.png', reputation: 97 },
    ];

    const displayRecruiting = (recruitingApps && recruitingApps.length > 0) ? recruitingApps : dummyRecruiting;
    const displayFilled = (filledApps && filledApps.length > 0) ? filledApps : dummyFilled;



    const allApps = [...(displayRecruiting || []), ...(displayFilled || [])];
    const filteredAllApps = allApps.filter(app => app.title.toLowerCase().includes(searchQuery.toLowerCase()));

    const chunkArray = (arr: any[], size: number) => {
        const chunked = [];
        if (!arr) return [];
        for (let i = 0; i < arr.length; i += size) {
            chunked.push(arr.slice(i, i + size));
        }
        return chunked;
    };

    const groupedRecruiting = chunkArray(displayRecruiting || [], 3);

    return (
        <View className="flex-1 bg-background">
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
                <View className="gap-6">
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

                    {/* Recruiting Now / Latest */}
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
                                            <AppCard key={app._id} item={app} onPress={() => router.push(`/app-details/${app._id}`)} />
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

                    {/* All Apps */}
                    <View>
                        <Text className="text-lg font-bold px-1 mb-3">All Apps</Text>
                        {filteredAllApps.length > 0 ? (
                            <View>
                                {filteredAllApps.map((app) => (
                                    <AppCard key={app._id} item={app} onPress={() => router.push(`/app-details/${app._id}`)} />
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
