import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { FlameIcon, TrendingUpIcon } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';

export function BoostedAppsSection() {
    const router = useRouter();
    const boostedApps = useQuery(api.boost.getBoostedApps) || [];

    // Don't render if no boosted apps
    if (boostedApps.length === 0) {
        return null;
    }

    return (
        <View className="pb-4">
            <View className="px-6 flex-row items-center gap-2 mb-3">
                <Icon as={FlameIcon} className="text-orange-500 size-5" />
                <Text className="text-xl font-bold text-foreground">Boosted Apps</Text>
                <View className="bg-orange-500/20 px-2 py-0.5 rounded-full">
                    <Text className="text-xs font-bold text-orange-500">TOP {boostedApps.length}</Text>
                </View>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
            >
                {boostedApps.map((app: any, index: number) => (
                    <TouchableOpacity
                        key={app._id}
                        activeOpacity={0.8}
                        onPress={() => router.push(`/app-details/${app._id}`)}
                    >
                        <Card className="w-40 border-2 border-orange-400/50 bg-gradient-to-br from-orange-500/5 to-yellow-500/5">
                            <CardContent className="p-3">
                                {/* Rank Badge */}
                                <View className="absolute -top-2 -right-2 z-10">
                                    <View className="bg-orange-500 rounded-full w-6 h-6 items-center justify-center shadow-lg">
                                        <Text className="text-white text-xs font-bold">
                                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                                        </Text>
                                    </View>
                                </View>

                                {/* App Icon */}
                                <View className="items-center mb-2">
                                    <Image
                                        source={{ uri: app.iconUrl }}
                                        style={{ width: 56, height: 56, borderRadius: 12 }}
                                        contentFit="cover"
                                    />
                                </View>

                                {/* App Title */}
                                <Text
                                    className="font-semibold text-sm text-center text-foreground"
                                    numberOfLines={1}
                                >
                                    {app.title}
                                </Text>

                                {/* Owner */}
                                <Text
                                    className="text-xs text-muted-foreground text-center mt-0.5"
                                    numberOfLines={1}
                                >
                                    by {app.ownerName}
                                </Text>

                                {/* Boost Score */}
                                <View className="flex-row items-center justify-center gap-1 mt-2">
                                    <Icon as={TrendingUpIcon} className="size-3 text-orange-500" />
                                    <Text className="text-xs font-bold text-orange-500">
                                        {app.boostScore || 0} pts
                                    </Text>
                                </View>
                            </CardContent>
                        </Card>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}
