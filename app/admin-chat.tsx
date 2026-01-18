import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, FlatList, Image } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Text } from '@/components/ui/text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { toast } from '@/lib/sonner';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, SendIcon, UserIcon, ShieldIcon } from 'lucide-react-native';
import { format } from 'date-fns';
import { Id } from '@/convex/_generated/dataModel';

export default function AdminChatScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { chatId, userId } = useLocalSearchParams<{ chatId?: string; userId?: string }>();

    // If Admin starting chat with user, we might only have userId
    // If User viewing, we might have nothing or chatId
    const createChat = useMutation(api.adminChats.createChatWithUser);
    const getMyChat = useMutation(api.adminChats.getMyChat);

    const [activeChatId, setActiveChatId] = useState<Id<"admin_chats"> | null>(
        chatId ? (chatId as Id<"admin_chats">) : null
    );

    const [initializing, setInitializing] = useState(!chatId);

    // Initialize chat
    useEffect(() => {
        const init = async () => {
            if (activeChatId) return;

            try {
                if (userId) {
                    // Admin mode: Create/Get chat with specific user
                    const id = await createChat({ userId: userId as Id<"users"> });
                    setActiveChatId(id);
                } else {
                    // User mode: Get my chat
                    const id = await getMyChat({});
                    setActiveChatId(id);
                }
            } catch (error) {
                console.error("Failed to init chat:", error);
                toast.error("Error", { description: "Failed to load chat" });
                router.back();
            } finally {
                setInitializing(false);
            }
        };
        init();
    }, [userId, activeChatId]);


    const chatDetails = useQuery(
        api.adminChats.getChatDetails,
        activeChatId ? { chatId: activeChatId } : "skip"
    );

    const sendMessage = useMutation(api.adminChats.sendMessage);
    const markAsRead = useMutation(api.adminChats.markAsRead);

    const [newMessage, setNewMessage] = useState("");
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Mark as read when messages load
    useEffect(() => {
        if (activeChatId && chatDetails?.messages) {
            markAsRead({ chatId: activeChatId });
        }
    }, [activeChatId, chatDetails?.messages?.length]);


    const handleSend = async () => {
        if (!newMessage.trim() || !activeChatId) return;

        setSending(true);
        try {
            await sendMessage({
                chatId: activeChatId,
                content: newMessage.trim(),
                type: "text",
            });
            setNewMessage("");
        } catch (error: any) {
            toast.error("Failed to send", { description: error.message });
        } finally {
            setSending(false);
        }
    };

    if (initializing || (activeChatId && !chatDetails)) {
        return (
            <SafeAreaView className="flex-1 bg-background items-center justify-center">
                <Text className="text-muted-foreground">Loading chat...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View className="flex-row items-center px-4 py-3 border-b border-border bg-background z-10">
                <TouchableOpacity onPress={() => router.back()} className="mr-3">
                    <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                </TouchableOpacity>
                <View className="flex-1 flex-row items-center">
                    {/* If Admin view, show User info. If User view, show 'Convex Support' */}
                    {userId ? (
                        <>
                            <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-2 border border-border">
                                {chatDetails?.userAvatar ? (
                                    <Image source={{ uri: chatDetails.userAvatar }} style={{ width: 30, height: 30, borderRadius: 15 }} />
                                ) : (
                                    <Icon as={UserIcon} className="text-foreground size-5" />
                                )}
                            </View>
                            <View>
                                <Text className="font-bold text-foreground">{chatDetails?.userName || "User"}</Text>
                                {chatDetails?.userEmail && <Text className="text-xs text-muted-foreground">{chatDetails.userEmail}</Text>}
                            </View>
                        </>
                    ) : (
                        <>
                            <View className="w-8 h-8 rounded-full bg-primary items-center justify-center mr-2">
                                <Icon as={ShieldIcon} className="text-primary-foreground size-5" />
                            </View>
                            <Text className="font-bold text-foreground">Admin Support</Text>
                        </>
                    )}
                </View>
            </View>

            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1"
            >
                <FlatList
                    ref={flatListRef}
                    data={chatDetails?.messages || []}
                    keyExtractor={(item) => item._id}
                    contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                    renderItem={({ item }) => {
                        // Logic to determine if "me" sent it depends on context
                        // But wait, senderId is the user ID.
                        // If I am viewing this, I have an identity.
                        // Ideally the backend returns isMe flag or we check against known ID.
                        // For simplicity, let's infer:
                        // If "userId" param is present (Admin View), then "Me" is the Admin. Admin is NOT the senderId if senderId == chatDetails.userId.
                        // Actually, simplified: Messages have senderId.
                        // If senderId == chatDetails.userId, it was sent by the User.
                        // If senderId != chatDetails.userId, it was sent by Admin.

                        const isUserMessage = item.senderId === chatDetails?.userId;

                        // If I am Admin (userId param exists), "Me" is (sender != userId)
                        // If I am User (userId param missing), "Me" is (sender == userId)

                        const isMe = userId ? !isUserMessage : isUserMessage;

                        return (
                            <View className={`mb-4 max-w-[85%] rounded-2xl p-3 ${isMe
                                ? 'bg-primary self-end rounded-tr-none'
                                : 'bg-muted self-start rounded-tl-none'
                                }`}>
                                <Text className={`text-base ${isMe ? 'text-primary-foreground' : 'text-foreground'}`}>
                                    {item.content}
                                </Text>
                                <Text className={`text-[10px] mt-1 text-right ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                    {format(item.sentAt, 'h:mm a')}
                                </Text>
                            </View>
                        );
                    }}
                />

                {/* Input */}
                <View className="flex-row items-center px-4 pt-4 border-t border-border bg-background" style={{ paddingBottom: insets.bottom }}>
                    <TextInput
                        className="flex-1 bg-secondary rounded-2xl px-4 py-2.5 text-foreground max-h-32 text-sm"
                        placeholder="Message..."
                        placeholderTextColor="#9ca3af"
                        value={newMessage}
                        onChangeText={setNewMessage}
                        multiline
                        blurOnSubmit={false}
                    />
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={sending || !newMessage.trim()}
                        className={`ml-3 w-10 h-10 rounded-full items-center justify-center ${!newMessage.trim() || sending ? 'bg-muted/50' : 'bg-primary'}`}
                    >
                        <Icon as={SendIcon} className={`size-5 ${!newMessage.trim() || sending ? 'text-muted-foreground' : 'text-primary-foreground'}`} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
