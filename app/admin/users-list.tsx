import React from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon } from 'lucide-react-native';
import { useLeaderboard } from '@/lib/api-hooks';

export default function AdminUsersListScreen() {
    const router = useRouter();
    const { data: leaderboardData } = useLeaderboard(100);
    const users = leaderboardData?.leaderboard || [];

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View className="px-4 py-3 border-b border-border flex-row items-center gap-3">
                <TouchableOpacity onPress={() => router.back()}>
                    <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-foreground">User Directory</Text>
            </View>

            <FlatList
                data={users}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <View className="p-4 border-b border-border flex-row justify-between items-center">
                        <View>
                            <Text className="font-bold text-foreground">{item.name || 'Anonymous'}</Text>
                            <Text className="text-xs text-muted-foreground">{item.completedMatchesCount} apps tested</Text>
                        </View>
                        <Text className="font-bold text-primary">{item.reputation} rep</Text>
                    </View>
                )}
            />
        </SafeAreaView>
    );
}
