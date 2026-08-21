import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, RefreshControl, Image, TextInput, SectionList } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, MessageSquareIcon, SearchIcon, ChevronRightIcon, UserIcon, ShieldIcon } from 'lucide-react-native';
import { toast } from '@/lib/sonner';
import { useAdminSupportChats, useAdminUsers, useGetOrCreateAdminUserChat } from '@/lib/api-hooks';

export default function AdminChatsListScreen() {
    const router = useRouter();
    const { data: chats, isLoading: isChatsLoading, refetch: refetchChats, isRefetching: isRefetchingChats } = useAdminSupportChats();
    const [searchQuery, setSearchQuery] = useState('');
    const { data: searchedUsers, isLoading: isUsersLoading } = useAdminUsers(searchQuery);
    const getOrCreateChat = useGetOrCreateAdminUserChat();

    const allChats = chats || [];
    const query = searchQuery.trim().toLowerCase();

    // Filter existing chats
    const matchingChats = allChats.filter((c) => {
        if (!query) return true;
        const name = c.user?.name?.toLowerCase() || '';
        const email = c.user?.email?.toLowerCase() || '';
        const lastMsg = c.lastMessage?.toLowerCase() || '';
        return name.includes(query) || email.includes(query) || lastMsg.includes(query);
    });

    // Users without an active chat matching the search query
    const chatUserIds = new Set(allChats.map((c) => c.userId));
    const nonChatUsers = query
        ? (searchedUsers || []).filter(
            (u) => !chatUserIds.has(u.id) && (u.name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query))
        )
        : [];

    const handleOpenChat = async (targetUserId: string, userName?: string) => {
        try {
            const chat = await getOrCreateChat.mutateAsync(targetUserId);
            router.push({
                pathname: '/admin-chat',
                params: { chatId: chat.id, userName },
            } as any);
        } catch (err: any) {
            toast.error('Failed to open chat', { description: err.message || 'Could not start conversation' });
        }
    };

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

    const renderUserItem = ({ item }: { item: NonNullable<typeof searchedUsers>[0] }) => {
        const userName = item.name || 'Developer';
        const userEmail = item.email;
        const avatarUrl = item.avatarUrl;

        return (
            <Card className="mb-3 border-border bg-card">
                <CardContent className="p-4 flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 mr-3">
                        {avatarUrl ? (
                            <Image
                                source={{ uri: avatarUrl }}
                                className="w-11 h-11 rounded-full bg-muted mr-3"
                            />
                        ) : (
                            <View className="w-11 h-11 rounded-full bg-primary/10 items-center justify-center mr-3">
                                <Icon as={UserIcon} className="text-primary size-5" />
                            </View>
                        )}

                        <View className="flex-1">
                            <View className="flex-row items-center gap-1.5">
                                <Text className="font-bold text-foreground text-base" numberOfLines={1}>
                                    {userName}
                                </Text>
                                {item.isAdmin && (
                                    <View className="bg-purple-100 dark:bg-purple-950 px-1.5 py-0.5 rounded">
                                        <Text className="text-[9px] font-bold text-purple-600 dark:text-purple-400 uppercase">
                                            Admin
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                                {userEmail}
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        onPress={() => handleOpenChat(item.id, userName)}
                        disabled={getOrCreateChat.isPending}
                        className="bg-primary px-3.5 py-1.5 rounded-lg flex-row items-center gap-1.5"
                    >
                        <Icon as={MessageSquareIcon} className="size-3.5 text-primary-foreground" />
                        <Text className="text-xs font-bold text-primary-foreground">
                            {getOrCreateChat.isPending ? 'Opening...' : 'Message'}
                        </Text>
                    </TouchableOpacity>
                </CardContent>
            </Card>
        );
    };

    const sections = [
        {
            title: query ? 'Conversations' : 'Support Inbox',
            data: matchingChats,
            type: 'chat' as const,
        },
        ...(nonChatUsers.length > 0
            ? [
                {
                    title: 'Other Registered Users',
                    data: nonChatUsers,
                    type: 'user' as const,
                },
            ]
            : []),
    ].filter((s) => s.data.length > 0);

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
                        <Text className="text-xs text-muted-foreground">Find users & message directly</Text>
                    </View>
                </View>
                <View className="bg-primary/10 px-3 py-1 rounded-full">
                    <Text className="text-primary font-bold text-xs">
                        {allChats.length} {allChats.length === 1 ? 'chat' : 'chats'}
                    </Text>
                </View>
            </View>

            {/* Search Input */}
            <View className="px-4 py-3">
                <View className="flex-row items-center bg-card border border-border rounded-xl px-3 py-2">
                    <Icon as={SearchIcon} className="text-muted-foreground size-4 mr-2" />
                    <TextInput
                        className="flex-1 text-foreground text-sm"
                        placeholder="Search by user email, name or message..."
                        placeholderTextColor="#888"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
            </View>

            {/* Content List */}
            {isChatsLoading || (query && isUsersLoading) ? (
                <View className="flex-1 items-center justify-center">
                    <Text className="text-muted-foreground">Searching conversations & users...</Text>
                </View>
            ) : sections.length === 0 ? (
                <View className="flex-1 items-center justify-center p-8">
                    <View className="w-16 h-16 bg-muted/50 rounded-full items-center justify-center mb-4">
                        <Icon as={MessageSquareIcon} className="text-muted-foreground size-8" />
                    </View>
                    <Text className="text-lg font-bold text-foreground mb-1">
                        {query ? 'No Results Found' : 'No Support Chats'}
                    </Text>
                    <Text className="text-sm text-muted-foreground text-center">
                        {query
                            ? `No user or conversation found matching "${searchQuery}".`
                            : 'No support conversations yet. Search any user by email above to start a chat.'}
                    </Text>
                </View>
            ) : (
                <SectionList
                    sections={sections as any}
                    keyExtractor={(item: any) => item.id}
                    renderSectionHeader={({ section }) => (
                        <View className="px-4 py-2 bg-background/90">
                            <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                {section.title}
                            </Text>
                        </View>
                    )}
                    renderItem={({ item, section }: { item: any; section: any }) =>
                        section.type === 'chat'
                            ? renderChatItem({ item })
                            : renderUserItem({ item })
                    }
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                    refreshControl={
                        <RefreshControl refreshing={isRefetchingChats} onRefresh={refetchChats} />
                    }
                />
            )}
        </SafeAreaView>
    );
}
