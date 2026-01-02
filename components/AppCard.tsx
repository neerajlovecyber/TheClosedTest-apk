
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
    // Add other fields if necessary
}

interface AppCardProps {
    item: AppItem;
    onPress?: () => void;
}

export function AppCard({ item, onPress }: AppCardProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Card className="mb-3 p-1.5 flex-row gap-2">                <Image
                source={{ uri: item.iconUrl || 'https://github.com/shadcn.png' }}
                className="w-20 h-20 rounded-xl bg-muted border border-border"
            />
                <View className="flex-1 justify-between py-0.5">
                    <View className="flex-row justify-between items-start">
                        <Text className="font-bold text-sm leading-tight flex-1 mr-2" numberOfLines={2}>{item.title}</Text>
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
                            <Text className="text-xs font-medium text-foreground" numberOfLines={1}>{item.ownerName || 'Unknown'}</Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                            <Icon as={StarIcon} className="size-3 text-green-600 dark:text-green-500 fill-green-600 dark:fill-green-500" />
                            <Text className="text-xs text-green-600 dark:text-green-500 font-bold">{item.reputation || 100}%</Text>
                        </View>
                    </View>
                </View>
            </Card>
        </TouchableOpacity>
    );
}
