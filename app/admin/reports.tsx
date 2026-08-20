import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, AlertCircleIcon } from 'lucide-react-native';

export default function AdminReportsScreen() {
    const router = useRouter();

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View className="px-4 py-3 border-b border-border flex-row items-center gap-3">
                <TouchableOpacity onPress={() => router.back()}>
                    <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-foreground">User Reports</Text>
            </View>

            <View className="flex-1 items-center justify-center p-8">
                <View className="w-16 h-16 bg-red-500/10 rounded-full items-center justify-center mb-4">
                    <Icon as={AlertCircleIcon} className="text-red-500 size-8" />
                </View>
                <Text className="text-lg font-bold text-foreground mb-1">Reports Inbox</Text>
                <Text className="text-sm text-muted-foreground text-center">
                    Community reports are actively recorded to PostgreSQL database.
                </Text>
            </View>
        </SafeAreaView>
    );
}
