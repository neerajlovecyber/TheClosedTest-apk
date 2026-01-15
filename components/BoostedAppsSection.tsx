import React from 'react';
import { View, TouchableOpacity, Image } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { FlameIcon, StarIcon, TrendingUpIcon } from 'lucide-react-native';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'expo-router';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';

export function BoostedAppsSection() {
    const router = useRouter();
    const { data: boostedApps } = useCachedConvexQuery(['boostedApps'], api.boost.getBoostedApps);

    // Don't render if no boosted apps
    if (!boostedApps || boostedApps.length === 0) {
        return null;
    }

    return (
        <View className="mb-2">
            {/* Section Header */}
            <View className="flex-row items-center gap-2 mb-3">
                <Icon as={FlameIcon} className="text-orange-500 size-5" />
                <Text className="text-lg font-bold text-foreground">Boosted Apps</Text>
            </View>

            {/* App Cards - Same style as All Apps with orange accents */}
            <View>
                {boostedApps.map((app: any) => (
                    <TouchableOpacity
                        key={app._id}
                        onPress={() => router.push(`/app-details/${app._id}`)}
                        activeOpacity={0.7}
                    >
                        <Card className="mb-3 p-1.5 flex-row gap-2 border-orange-400/40 bg-orange-500/5">
                            {/* App Icon */}
                            <Image
                                source={{ uri: app.iconUrl || 'https://github.com/shadcn.png' }}
                                className="w-20 h-20 rounded-xl bg-muted border border-orange-400/30"
                            />

                            <View className="flex-1 justify-between py-0.5">
                                {/* Header Row: Title & Boost Badge */}
                                <View className="flex-row justify-between items-start">
                                    <Text className="font-bold text-sm leading-tight flex-1 mr-2" numberOfLines={2}>
                                        {app.title}
                                    </Text>
                                    <View className="bg-orange-500/20 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                                        <Icon as={TrendingUpIcon} className="size-3 text-orange-500" />
                                        <Text className="text-[10px] text-orange-500 font-bold">{app.boostScore || 0} pts</Text>
                                    </View>
                                </View>

                                {/* Middle Row: Testers */}
                                <Text className="text-muted-foreground text-sm">
                                    {app.currentTesters || 0} / {app.requiredTesters || 12} Testers
                                </Text>

                                {/* Bottom Row: Owner & Reputation */}
                                <View className="flex-row items-center gap-3 mt-1">
                                    <View className="bg-secondary/50 px-2 py-1 rounded-md">
                                        <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
                                            {app.ownerName || 'Unknown'}
                                        </Text>
                                    </View>
                                    <View className="flex-row items-center gap-1">
                                        <Icon as={StarIcon} className="size-3 text-green-600 dark:text-green-500 fill-green-600 dark:fill-green-500" />
                                        <Text className="text-xs text-green-600 dark:text-green-500 font-bold">
                                            {app.reputation || 100}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </Card>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}
