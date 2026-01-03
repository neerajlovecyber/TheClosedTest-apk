import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon } from 'lucide-react-native';

export default function AnalyticsScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const filter = (params.filter as 'active' | 'new' | 'all') || 'all';

    const users = useQuery(api.admin.getUsersByFilter, { filter });

    const getTitle = () => {
        switch (filter) {
            case 'active': return 'Daily Active Users';
            case 'new': return 'New Users Today';
            case 'all': return 'All Users';
            default: return 'Users';
        }
    };

    const UserRow = ({ item, index }: any) => (
        <View className={`flex-row items-center py-3 border-b border-border/50 ${index % 2 === 0 ? 'bg-secondary/10' : ''}`}>
            <View className="w-10 h-10 rounded-full bg-muted items-center justify-center mr-3">
                <Text className="font-bold text-muted-foreground">{item.name?.[0] || 'U'}</Text>
            </View>
            <View className="flex-1">
                <Text className="font-medium text-foreground">{item.name || 'Anonymous'}</Text>
                <Text className="text-xs text-muted-foreground">{item.email || 'No email'}</Text>
            </View>
            <View className="items-end">
                <Text className="text-xs text-foreground font-mono">{new Date(item.createdAt).toLocaleDateString()}</Text>
                <View className={`px-2 py-0.5 rounded-full mt-1 ${item.isGroupMember ? 'bg-green-100 dark:bg-green-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                    <Text className={`text-[10px] font-bold ${item.isGroupMember ? 'text-green-600' : 'text-orange-600'}`}>
                        {item.isGroupMember ? 'Verified' : 'Unverified'}
                    </Text>
                </View>
            </View>
        </View>
    );

    return (
        <View className="flex-1 bg-background">
            <View className="px-6 py-4 flex-row items-center border-b border-border/50">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-foreground">{getTitle()}</Text>
            </View>

            <ScrollView className="flex-1 px-4">
                {users ? (
                    users.length > 0 ? (
                        users.map((user: any, index: number) => (
                            <UserRow key={user._id} item={user} index={index} />
                        ))
                    ) : (
                        <View className="py-20 items-center">
                            <Text className="text-muted-foreground">No users found for this category.</Text>
                        </View>
                    )
                ) : (
                    <Text className="text-center py-10 text-muted-foreground">Loading...</Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
