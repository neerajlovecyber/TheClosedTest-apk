import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, MessageSquareIcon } from 'lucide-react-native';

export default function AdminChatsListScreen() {
    const router = useRouter();

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View className="px-4 py-3 border-b border-border flex-row items-center gap-3">
                <TouchableOpacity onPress={() => router.back()}>
                    <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-foreground">Support Chats</Text>
            </View>

            <View className="flex-1 items-center justify-center p-8">
                <View className="w-16 h-16 bg-muted/50 rounded-full items-center justify-center mb-4">
                    <Icon as={MessageSquareIcon} className="text-muted-foreground size-8" />
                </View>
                <Text className="text-lg font-bold text-foreground mb-1">Support Dashboard</Text>
                <Text className="text-sm text-muted-foreground text-center mb-6">
                    Connect directly to live support channels.
                </Text>
                <TouchableOpacity
                    onPress={() => router.push('/admin-chat' as any)}
                    className="bg-primary px-6 py-3 rounded-xl"
                >
                    <Text className="text-primary-foreground font-bold">Open My Support Chat</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
