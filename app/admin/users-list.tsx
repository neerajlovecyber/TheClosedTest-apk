import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, TextInput, Image, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/lib/sonner';
import { useAdminUsers, useGetOrCreateAdminUserChat } from '@/lib/api-hooks';

export default function AdminUsersListScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const { data: users, isLoading, refetch, isRefetching } = useAdminUsers(searchQuery);
    const getOrCreateChat = useGetOrCreateAdminUserChat();

    const userList = users || [];

    const handleOpenChat = async (targetUser: NonNullable<typeof users>[0]) => {
        try {
            const chat = await getOrCreateChat.mutateAsync(targetUser.id);
            router.push({
                pathname: '/admin-chat',
                params: {
                    chatId: chat.id,
                    userName: targetUser.name || targetUser.email,
                },
            } as any);
        } catch (err: any) {
            toast.error('Failed to open chat', { description: err.message || 'Could not start chat' });
        }
    };

    const renderUserItem = ({ item }: { item: NonNullable<typeof users>[0] }) => {
        return (
            <Card className="mb-3 border-border bg-card">
                <CardContent className="p-4">
                    <View className="flex-row items-start justify-between">
                        <View className="flex-row items-center flex-1 mr-2">
                            {item.avatarUrl ? (
                                <Image
                                    source={{ uri: item.avatarUrl }}
                                    className="w-12 h-12 rounded-full bg-muted mr-3"
                                />
                            ) : (
                                <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center mr-3">
                                    <Icon as={UserIcon} className="text-primary size-6" />
                                </View>
                            )}

                            <View className="flex-1">
                                <View className="flex-row items-center gap-1.5 flex-wrap">
                                    <Text className="font-bold text-foreground text-base" numberOfLines={1}>
                                        {item.name || 'Anonymous Developer'}
                                    </Text>
                                    {item.isAdmin && (
                                        <View className="bg-purple-100 dark:bg-purple-950 px-1.5 py-0.5 rounded flex-row items-center gap-0.5">
                                            <Icon as={ShieldIcon} className="size-2.5 text-purple-600 dark:text-purple-400" />
                                            <Text className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase">
                                                Admin
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                                    {item.email}
                                </Text>
                            </View>
                        </View>

                        <View className="items-end">
                            <View className="bg-primary/10 px-2 py-0.5 rounded-full mb-1">
                                <Text className="text-xs font-black text-primary">{item.reputation} rep</Text>
                            </View>
                            <Text className="text-[10px] text-muted-foreground">
                                {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                        </View>
                    </View>

                    {/* Stats & Actions Footer */}
                    <View className="mt-3 pt-3 border-t border-border/50 flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3">
                            <Text className="text-xs text-muted-foreground">
                                <Text className="font-bold text-foreground">{item.appsCount}</Text> apps
                            </Text>
                            <View className="flex-row items-center gap-0.5">
                                <Icon as={FlameIcon} className="text-orange-500 size-3.5" />
                                <Text className="text-xs font-bold text-orange-500">{item.streak}d streak</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={() => handleOpenChat(item)}
                            disabled={getOrCreateChat.isPending}
                            className="bg-primary px-3.5 py-1.5 rounded-lg flex-row items-center gap-1.5"
                        >
                            <Icon as={MessageSquareIcon} className="size-3.5 text-primary-foreground" />
                            <Text className="text-xs font-bold text-primary-foreground">
                                {getOrCreateChat.isPending ? 'Opening...' : 'Message'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </CardContent>
            </Card>
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
                        <Text className="text-xl font-black text-foreground tracking-tight">User Directory</Text>
                        <Text className="text-xs text-muted-foreground">Browse & search all registered accounts</Text>
                    </View>
                </View>
                <View className="bg-primary/10 px-3 py-1 rounded-full">
                    <Text className="text-primary font-bold text-xs">
                        {userList.length} users
                    </Text>
                </View>
            </View>

            {/* Search Input */}
            <View className="px-4 py-3">
                <View className="flex-row items-center bg-card border border-border rounded-xl px-3 py-2">
                    <Icon as={SearchIcon} className="text-muted-foreground size-4 mr-2" />
                    <TextInput
                        className="flex-1 text-foreground text-sm"
                        placeholder="Search by email, name or ID..."
                        placeholderTextColor="#888"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
            </View>

            {/* Users List */}
            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <Text className="text-muted-foreground">Searching user directory...</Text>
                </View>
            ) : userList.length === 0 ? (
                <View className="flex-1 items-center justify-center p-8">
                    <View className="w-16 h-16 bg-muted/50 rounded-full items-center justify-center mb-4">
                        <Icon as={UserIcon} className="text-muted-foreground size-8" />
                    </View>
                    <Text className="text-lg font-bold text-foreground mb-1">No Users Found</Text>
                    <Text className="text-sm text-muted-foreground text-center">
                        {searchQuery ? `No registered user matches "${searchQuery}".` : 'No registered users found.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={userList}
                    keyExtractor={(item) => item.id}
                    renderItem={renderUserItem}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                    refreshControl={
                        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
                    }
                />
            )}
        </SafeAreaView>
    );
}
