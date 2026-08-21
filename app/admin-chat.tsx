import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Text } from '@/components/ui/text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { toast } from '@/lib/sonner';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, SendIcon, ShieldIcon } from 'lucide-react-native';
import { LinkableText } from '@/components/ui/LinkableText';
import { api } from '@/lib/api';
import { useMySupportChat, useSupportChatDetails, useSendSupportMessage } from '@/lib/api-hooks';

export default function AdminChatScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { chatId } = useLocalSearchParams<{ chatId?: string }>();

    const { data: myChat } = useMySupportChat();
    const effectiveChatId = chatId || myChat?.id;

    const { data: chatData, isLoading } = useSupportChatDetails(effectiveChatId);
    const sendMessageMutation = useSendSupportMessage();

    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    const messages = chatData?.messages || [];

    const handleSend = async () => {
        if (!newMessage.trim()) return;

        setSending(true);
        try {
            let targetChatId = effectiveChatId;
            if (!targetChatId) {
                const created = await api.post<{ id: string }>('/api/support/my-chat');
                targetChatId = created?.id;
            }

            if (!targetChatId) {
                toast.error('Support chat unavailable. Please try again.');
                return;
            }

            await sendMessageMutation.mutateAsync({
                chatId: targetChatId,
                content: newMessage.trim(),
                type: 'text',
            });
            setNewMessage('');
        } catch (error: any) {
            toast.error('Failed to send', { description: error.message || 'Could not send message' });
        } finally {
            setSending(false);
        }
    };

    const renderMessage = ({ item }: { item: any }) => {
        const isFromAdmin = item.isAdmin;
        return (
            <View className={`flex-row ${!isFromAdmin ? 'justify-end' : 'justify-start'} mb-3 px-4`}>
                <View
                    style={{ maxWidth: '80%' }}
                    className={`px-4 py-2.5 rounded-2xl ${!isFromAdmin ? 'bg-primary rounded-tr-none' : 'bg-secondary rounded-tl-none border border-border/50'}`}
                >
                    {isFromAdmin && (
                        <View className="flex-row items-center gap-1 mb-1">
                            <Icon as={ShieldIcon} className="text-primary size-3" />
                            <Text className="text-[10px] font-bold text-primary">Support Team</Text>
                        </View>
                    )}
                    <LinkableText text={item.content} className={`${!isFromAdmin ? 'text-primary-foreground font-medium' : 'text-foreground'}`} />
                    <Text className={`text-[10px] mt-1 ${!isFromAdmin ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground'}`}>
                        {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                    <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
                        <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                    </TouchableOpacity>
                    <View>
                        <Text className="text-lg font-bold text-foreground">Official Support</Text>
                        <Text className="text-xs text-muted-foreground">Direct chat with admins</Text>
                    </View>
                </View>
            </View>

            <KeyboardAvoidingView className="flex-1" behavior="padding">
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={{ paddingVertical: 16 }}
                    className="flex-1"
                />

                <View
                    style={{ paddingBottom: Math.max(insets.bottom, 16) }}
                    className="p-4 bg-background border-t border-border flex-row items-center gap-2"
                >
                    <TextInput
                        value={newMessage}
                        onChangeText={setNewMessage}
                        placeholder="Type a message to support..."
                        placeholderTextColor="#9ca3af"
                        className="flex-1 bg-secondary text-foreground px-4 py-3 rounded-full text-base"
                        returnKeyType="send"
                        onSubmitEditing={handleSend}
                    />
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={!newMessage.trim() || sending}
                        className={`w-12 h-12 rounded-full items-center justify-center ${newMessage.trim() ? 'bg-primary' : 'bg-muted'}`}
                    >
                        <Icon as={SendIcon} className="text-primary-foreground size-5" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
