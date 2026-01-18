import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, TextInput, Image } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter, Stack } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, SearchIcon, UserIcon, CheckCheckIcon } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';

export default function AdminChatsListScreen() {
    const router = useRouter();
    const chats = useQuery(api.adminChats.listChats) || [];
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResult, setSearchResult] = useState<any[]>([]);

    // We can use a separate query for search users if needed
    const foundUsers = useQuery(api.adminChats.searchUsersToChat, { query: searchQuery });

    const handleChatPress = (chatId: string, userId: string) => {
        router.push({
            pathname: "/admin-chat",
            params: { chatId, userId }
        });
    };

    const handleUserSearchPress = (userId: string) => {
        // Start chat with this user
        router.push({
            pathname: "/admin-chat",
            params: { userId }
        });
        setSearchQuery("");
    };

    const renderChatItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            onPress={() => handleChatPress(item._id, item.userId)}
            className="flex-row items-center p-4 border-b border-border bg-background"
        >
            <View className="relative">
                {item.userAvatar ? (
                    <Image source={{ uri: item.userAvatar }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                ) : (
                    <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
                        <Icon as={UserIcon} className="text-muted-foreground size-6" />
                    </View>
                )}
                {item.hasUnreadAdmin && (
                    <View className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-background" />
                )}
            </View>

            <View className="flex-1 ml-3.5">
                <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-bold text-base text-foreground flex-1 pr-2" numberOfLines={1}>
                        {item.userName}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                        {formatDistanceToNow(item.updatedAt, { addSuffix: true })}
                    </Text>
                </View>
                <Text className={`text-sm ${item.hasUnreadAdmin ? 'font-bold text-foreground' : 'text-muted-foreground'}`} numberOfLines={1}>
                    {item.lastMessage}
                </Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View className="px-4 py-3 border-b border-border flex-row items-center gap-3">
                <TouchableOpacity onPress={() => router.back()}>
                    <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-foreground">Support Chats</Text>
            </View>

            <View className="p-4 pb-2">
                <View className="flex-row items-center bg-muted/50 rounded-xl px-3 py-2.5 border border-border">
                    <Icon as={SearchIcon} className="text-muted-foreground size-5 mr-2" />
                    <TextInput
                        placeholder="Search users to chat..."
                        className="flex-1 text-foreground font-medium"
                        placeholderTextColor="#999"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {searchQuery ? (
                <FlatList
                    data={foundUsers || []}
                    keyExtractor={(item) => item._id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => handleUserSearchPress(item._id)}
                            className="flex-row items-center p-4 border-b border-border bg-background"
                        >
                            <View className="w-10 h-10 rounded-full bg-muted items-center justify-center mr-3">
                                <Icon as={UserIcon} className="text-muted-foreground size-5" />
                            </View>
                            <View>
                                <Text className="font-bold text-foreground">{item.name || "Unknown"}</Text>
                                <Text className="text-xs text-muted-foreground">{item.email || "No email"}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View className="p-8 items-center">
                            <Text className="text-muted-foreground">No users found.</Text>
                        </View>
                    }
                />
            ) : (
                <FlatList
                    data={chats}
                    keyExtractor={(item) => item._id}
                    renderItem={renderChatItem}
                    ListEmptyComponent={
                        <View className="flex-1 items-center justify-center p-8 mt-10">
                            <View className="w-16 h-16 bg-muted/50 rounded-full items-center justify-center mb-4">
                                <Icon as={UserIcon} className="text-muted-foreground/50 size-8" />
                            </View>
                            <Text className="text-lg font-bold text-muted-foreground mb-1">No Active Chats</Text>
                            <Text className="text-sm text-muted-foreground text-center">
                                Messages from users will appear here.
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}
