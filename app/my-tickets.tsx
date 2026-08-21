import React from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { PlusIcon, MessageSquareIcon, ChevronRightIcon, ArrowLeftIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useMySupportChat, useSupportChatDetails } from '@/lib/api-hooks';

export default function MyTicketsScreen() {
    const router = useRouter();
    const { data: myChat, isLoading } = useMySupportChat();
    const { data: chatDetails } = useSupportChatDetails(myChat?.id);

    const messages = chatDetails?.messages || [];

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['left', 'right', 'bottom']}>
            <View className="flex-1 px-4 pt-4">
                <View className="flex-row items-center mb-6">
                    <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
                        <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                    </TouchableOpacity>
                    <View>
                        <Text className="text-2xl font-black text-foreground tracking-tight">Support Tickets</Text>
                        <Text className="text-muted-foreground font-medium text-xs mt-0.5">Track your support requests</Text>
                    </View>
                </View>

                {isLoading ? (
                    <View className="flex-1 items-center justify-center">
                        <Text className="text-muted-foreground">Loading support channel...</Text>
                    </View>
                ) : (
                    <View className="flex-1">
                        <TouchableOpacity
                            onPress={() => router.push('/admin-chat' as any)}
                            activeOpacity={0.7}
                            className="mb-4"
                        >
                            <Card className="border-primary/30 bg-primary/5 shadow-sm">
                                <CardContent className="p-4">
                                    <View className="flex-row justify-between items-start mb-2">
                                        <View className="px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30">
                                            <Text className="text-xs font-bold text-blue-700 dark:text-blue-400">
                                                {(myChat as any)?.status?.toUpperCase() || 'ACTIVE SUPPORT'}
                                            </Text>
                                        </View>
                                        <Text className="text-xs text-muted-foreground">
                                            Live Channel
                                        </Text>
                                    </View>

                                    <Text className="text-lg font-bold text-foreground mb-1">
                                        Official Support Chat
                                    </Text>

                                    <View className="flex-row items-center justify-between mt-2">
                                        <Text className="text-sm text-muted-foreground flex-1 mr-2" numberOfLines={1}>
                                            {messages.length > 0 ? messages[messages.length - 1]?.content : 'Start a chat with our developer support team'}
                                        </Text>
                                        <Icon as={ChevronRightIcon} className="size-4 text-muted-foreground" />
                                    </View>
                                </CardContent>
                            </Card>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => router.push('/create-ticket')}
                            className="bg-primary p-4 rounded-2xl flex-row items-center justify-center gap-2"
                        >
                            <Icon as={PlusIcon} className="text-primary-foreground size-5" />
                            <Text className="text-primary-foreground font-bold text-base">New Support Request</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}
