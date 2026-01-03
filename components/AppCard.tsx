
import React from 'react';
import { View, Image, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { StarIcon } from 'lucide-react-native';

export interface AppItem {
    _id: string;
    title: string;
    iconUrl?: string;
    currentTesters?: number;
    requiredTesters?: number;
    ownerAvatar?: string;
    ownerName?: string;
    reputation?: number;
    status?: string; // 'recruiting', 'filled', 'pending', 'completed'
    day?: number;
    totalDays?: number;
    dueIn?: string;
    isFilled?: boolean;
    isNew?: boolean;
}

interface AppCardProps {
    item: AppItem;
    onPress?: () => void;
    variant?: 'marketplace' | 'my-app' | 'testing';
}

export function AppCard({ item, onPress, variant = 'marketplace' }: AppCardProps) {
    const isMyApp = variant === 'my-app';
    const isTesting = variant === 'testing';

    // Determine if filled (either from flag or by comparing testers)
    const isFilled = item.isFilled || (item.currentTesters !== undefined && item.requiredTesters !== undefined && item.currentTesters >= item.requiredTesters);

    const Content = (
        <Card className="mb-3 p-1.5 flex-row gap-2">
            <Image
                source={{ uri: item.iconUrl || 'https://github.com/shadcn.png' }}
                className="w-20 h-20 rounded-xl bg-muted border border-border"
            />
            <View className="flex-1 justify-between py-0.5">
                {/* Header Row: Title & Badge */}
                <View className="flex-row justify-between items-start">
                    <Text className="font-bold text-sm leading-tight flex-1 mr-2" numberOfLines={2}>{item.title}</Text>

                    {/* Variant Specific Badges */}
                    {variant === 'marketplace' && (
                        isFilled ? (
                            <View className="bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                                <Text className="text-[10px] text-red-600 dark:text-red-400 font-bold uppercase">Filled</Text>
                            </View>
                        ) : item.isNew ? (
                            <View className="bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                                <Text className="text-[10px] text-green-600 dark:text-green-400 font-bold uppercase">New</Text>
                            </View>
                        ) : null
                    )}
                    {isMyApp && (
                        <View className={`px-2 py-0.5 rounded-full ${isFilled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary/10'}`}>
                            <Text className={`text-[10px] font-bold uppercase ${isFilled ? 'text-green-600 dark:text-green-400' : 'text-primary'}`}>
                                {isFilled ? 'Filled' : item.status || 'Active'}
                            </Text>
                        </View>
                    )}
                    {isTesting && item.dueIn && (
                        <View className="bg-destructive/10 px-2 py-0.5 rounded-full">
                            <Text className="text-[10px] text-destructive font-bold uppercase">{item.dueIn}</Text>
                        </View>
                    )}
                </View>

                {/* Middle Row: Subtitle / Stats */}
                {!isTesting ? (
                    <Text className="text-muted-foreground text-sm">
                        {item.currentTesters || 0} / {item.requiredTesters || 12} Testers
                    </Text>
                ) : (
                    <Text className="text-muted-foreground text-sm">Owner: {item.ownerName}</Text>
                )}


                {/* Bottom Row / Content */}
                <View className="mt-1">
                    {variant === 'marketplace' && (
                        <View className="flex-row items-center gap-3">
                            <View className="bg-secondary/50 px-2 py-1 rounded-md">
                                <Text className="text-xs font-medium text-foreground" numberOfLines={1}>{item.ownerName || 'Unknown'}</Text>
                            </View>
                            <View className="flex-row items-center gap-1">
                                <Icon as={StarIcon} className="size-3 text-green-600 dark:text-green-500 fill-green-600 dark:fill-green-500" />
                                <Text className="text-xs text-green-600 dark:text-green-500 font-bold">{item.reputation || 100}%</Text>
                            </View>
                        </View>
                    )}

                    {isMyApp && (
                        <View className="h-2 bg-secondary rounded-full overflow-hidden w-full">
                            <View
                                className={`h-full ${isFilled ? 'bg-green-500' : 'bg-primary'}`}
                                style={{ width: `${Math.min(100, ((item.currentTesters || 0) / (item.requiredTesters || 12)) * 100)}%` }}
                            />
                        </View>
                    )}

                    {isTesting && (
                        <View className="flex-row items-center gap-1.5">
                            {/* Simple Day Indicator */}
                            <View className="bg-secondary/50 px-2 py-1 rounded-md">
                                <Text className="text-xs font-medium text-foreground">Day {item.day || 1} of {item.totalDays || 14}</Text>
                            </View>
                        </View>
                    )}
                </View>
            </View>
        </Card>
    );

    if (onPress) {
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
                {Content}
            </TouchableOpacity>
        );
    }

    return Content;
}

