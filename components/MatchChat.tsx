import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, Platform, Modal, Pressable, useWindowDimensions, TextInput, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { SendIcon, ChevronDownIcon, FlagIcon } from 'lucide-react-native';
import { useMatchMessages, useSendMessage, useMarkMessagesRead } from '@/lib/api-hooks';

interface MatchChatProps {
    visible: boolean;
    onClose: () => void;
    matchId: string;
    partnerName: string;
    onReport?: () => void;
    currentUserId?: string;
}

export function MatchChat({ visible, onClose, matchId, partnerName, onReport, currentUserId }: MatchChatProps) {
    const { height: SCREEN_HEIGHT } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { data: messages = [] } = useMatchMessages(visible ? matchId : undefined);
    const sendMessageMutation = useSendMessage();
    const markAsReadMutation = useMarkMessagesRead();
    const [newMessage, setNewMessage] = useState('');
    const inputRef = useRef<TextInput>(null);

    const chatMessages = useMemo(() => {
        return [...messages].reverse();
    }, [messages]);

    useEffect(() => {
        if (visible && matchId) {
            markAsReadMutation.mutateAsync(matchId).catch(() => {});
        }
    }, [visible, matchId]);

    const handleSend = async () => {
        if (!newMessage.trim()) return;
        const text = newMessage;
        setNewMessage('');
        try {
            await sendMessageMutation.mutateAsync({
                matchId,
                content: text,
                type: 'text',
            });
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    const renderMessage = ({ item }: { item: any }) => {
        const isMe = currentUserId ? (item.senderId === currentUserId || item.senderId === 'me') : (item.isMe || item.senderId === 'me');
        return (
            <View className={`flex-row ${isMe ? 'justify-end' : 'justify-start'} mb-3 px-4`}>
                <View
                    style={{ maxWidth: '80%' }}
                    className={`px-4 py-2 rounded-2xl ${isMe ? 'bg-primary rounded-tr-none' : 'bg-secondary rounded-tl-none'}`}
                >
                    <Text className={`${isMe ? 'text-primary-foreground font-medium' : 'text-foreground'}`}>
                        {item.content}
                    </Text>
                    <Text className={`text-[10px] mt-1 ${isMe ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground'}`}>
                        {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            statusBarTranslucent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1"
            >
                <View className="flex-1 justify-end">
                    <Pressable
                        className="absolute inset-0 bg-black/40"
                        onPress={onClose}
                    />

                    <View
                        style={{ height: SCREEN_HEIGHT * 0.75 }}
                        className="bg-background rounded-t-[32px] overflow-hidden shadow-2xl border-t border-border"
                    >
                        <View className="flex-row items-center justify-between px-6 py-4 border-b border-border bg-background">
                            <View>
                                <Text className="text-xl font-bold text-foreground">{partnerName}</Text>
                                <Text className="text-xs text-muted-foreground">Peer-testing chat</Text>
                            </View>
                            <View className="flex-row items-center gap-2">
                                {onReport && (
                                    <TouchableOpacity onPress={onReport} className="p-2">
                                        <Icon as={FlagIcon} className="text-destructive size-5" />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={onClose} className="p-2">
                                    <Icon as={ChevronDownIcon} className="text-foreground size-6" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <FlatList
                            data={chatMessages}
                            inverted
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
                                ref={inputRef}
                                value={newMessage}
                                onChangeText={setNewMessage}
                                placeholder="Type a message..."
                                placeholderTextColor="#9ca3af"
                                className="flex-1 bg-secondary text-foreground px-4 py-3 rounded-full text-base"
                                returnKeyType="send"
                                onSubmitEditing={handleSend}
                            />
                            <TouchableOpacity
                                onPress={handleSend}
                                disabled={!newMessage.trim()}
                                className={`w-12 h-12 rounded-full items-center justify-center ${newMessage.trim() ? 'bg-primary' : 'bg-muted'}`}
                            >
                                <Icon as={SendIcon} className="text-primary-foreground size-5" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
