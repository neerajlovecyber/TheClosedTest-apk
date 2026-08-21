import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, RefreshControl, Image, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, MessageSquareIcon, SearchIcon, ChevronRightIcon, UserIcon } from 'lucide-react-native';
import { useAdminSupportChats } from '@/lib/api-hooks';

export default function AdminChatsListScreen() {
    const router = useRouter();
    const { data: chats, isLoading, refetch, isRefetching } = useAdminSupportChats();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredChats = (chats || []).filter((c) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const name = c.user?.name?.toLowerCase() || '';
        const email = c.user?.email?.toLowerCase() || '';
        const lastMsg = c.lastMessage?.toLowerCase() || '';
        return name.includes(q) || email.includes(q) || lastMsg.includes(q);
    });

    const renderChatItem = ({ item }: { item: NonNullable<typeof chats>[0] }) => {
        const userName = item.user?.name || 'Developer';
        const userEmail = item.user?.email || item.userId;
        const avatarUrl = item.user?.avatarUrl;
        const hasUnread = item.hasUnreadAdmin;

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                className="mb-3"
                onPress={() =>
                    router.push({
                        pathname: '/admin-chat',
                        params: { chatId: item.id, userName },
                    } as any)
                }
            >
                <Card className={`border-border ${hasUnread ? 'bg-primary/5 border-primary/40' : 'bg-card'}`}>
                    <CardContent className="p-4 flex-row items-center justify-between">
                        <View className="flex-row items-center flex-1 mr-3">
                            <View className="relative mr-3">
                                {avatarUrl ? (
                                    <Image
                                        source={{ uri: avatarUrl }}
                                        className="w-12 h-12 rounded-full bg-muted"
                                    />
                                ) : (
                                    <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
                                        <Icon as={UserIcon} className="text-primary size-6" />
                                    </View>
                                )}
                                {hasUnread && (
                                    <View className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-background" />
                                )}
                            </View>

                            <View className="flex-1">
                                <View className="flex-row items-center justify-between">
                                    <Text className="font-bold text-foreground text-base" numberOfLines={1}>
                                        {userName}
                                    </Text>
                                    <Text className="text-[11px] text-muted-foreground ml-2">
                                        {new Date(item.updatedAt).toLocaleDateString([], {
                                            month: 'short',
                                            day: 'numeric',
                                        })}
                                    </Text>
                                </View>

                                <Text className="text-xs text-muted-foreground mb-1" numberOfLines={1}>
                                    {userEmail}
                                </Text>

                                <Text
                                    className={`text-xs ${hasUnread ? 'font-bold text-foreground' : 'text-muted-foreground'}`}
                                    numberOfLines={1}
                                >
                                    {item.lastMessage || 'No messages yet'}
                                </Text>
                            </View>
                        </View>

                        <Icon as={ChevronRightIcon} className="text-muted-foreground size-5" />
                    </CardContent>
                </Card>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                    <TouchableOpacity onPress={() => router.back()} className="p-1">
                        <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                    </TouchableOpacity>
                    <View>
                        <Text className="text-xl font-black text-foreground tracking-tight">Support Inbox</Text>
                        <Text className="text-xs text-muted-foreground">User help requests & conversations</Text>
                    </View>
                </View>
                <View className="bg-primary/10 px-3 py-1 rounded-full">
                    <Text className="text-primary font-bold text-xs">
                        {filteredChats.length} {filteredChats.length === 1 ? 'chat' : 'chats'}
                    </Text>
                </View>
            </View>

            {/* Search Input */}
            <View className="px-4 py-3">
                <View className="flex-row items-center bg-card border border-border rounded-xl px-3 py-2">
                    <Icon as={SearchIcon} className="text-muted-foreground size-4 mr-2" />
                    <TextInput
                        className="flex-1 text-foreground text-sm"
                        placeholder="Search by name, email or message..."
                        placeholderTextColor="#888"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {/* Chats List */}
            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <Text className="text-muted-foreground">Loading support conversations...</Text>
                </View>
            ) : filteredChats.length === 0 ? (
                <View className="flex-1 items-center justify-center p-8">
                    <View className="w-16 h-16 bg-muted/50 rounded-full items-center justify-center mb-4">
                        <Icon as={MessageSquareIcon} className="text-muted-foreground size-8" />
                    </View>
                    <Text className="text-lg font-bold text-foreground mb-1">No Support Chats Found</Text>
                    <Text className="text-sm text-muted-foreground text-center">
                        {searchQuery ? 'No conversations match your search query.' : 'No users have started a support ticket yet.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredChats}
                    keyExtractor={(item) => item.id}
                    renderItem={renderChatItem}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                    refreshControl={
                        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
                    }
                />
            )}
        </SafeAreaView>
    );
}
