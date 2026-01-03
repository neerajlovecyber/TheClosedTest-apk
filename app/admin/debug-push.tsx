import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon } from 'lucide-react-native';

export default function DebugPushScreen() {
    const router = useRouter();
    const currentUser = useQuery(api.users.getCurrentUser);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <View className="px-6 py-4 flex-row items-center border-b border-border/50">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-foreground">Debug Push Token</Text>
            </View>

            <ScrollView className="flex-1 px-6 py-4">
                <View className="bg-card p-4 rounded-xl border border-border">
                    <Text className="text-sm font-bold mb-2">Current User Info:</Text>

                    {currentUser ? (
                        <>
                            <Text className="text-xs text-muted-foreground mb-1">
                                Name: {currentUser.name || 'N/A'}
                            </Text>
                            <Text className="text-xs text-muted-foreground mb-1">
                                Email: {currentUser.email || 'N/A'}
                            </Text>
                            <Text className="text-xs text-muted-foreground mb-3">
                                Has Push Token: {currentUser.pushToken ? 'YES' : 'NO'}
                            </Text>

                            {currentUser.pushToken && (
                                <View className="bg-muted p-3 rounded-lg">
                                    <Text className="text-xs font-bold mb-1">Push Token:</Text>
                                    <Text className="text-[10px] text-foreground font-mono" selectable>
                                        {currentUser.pushToken}
                                    </Text>
                                </View>
                            )}
                        </>
                    ) : (
                        <Text className="text-muted-foreground">Loading...</Text>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
